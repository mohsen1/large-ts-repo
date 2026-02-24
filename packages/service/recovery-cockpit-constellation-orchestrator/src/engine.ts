import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import {
  buildConstellationTimestamp,
  buildConstellationTimestampBrand,
  ConstellationContext,
  ConstellationEvent,
  ConstellationMode,
  ConstellationPlugin,
  ConstellationPluginRegistry,
  ConstellationRunId,
  ConstellationStage,
  ConstellationTemplateId,
  buildSimulationPath,
  inferDefaultPath,
  simulateRun,
} from '@domain/recovery-cockpit-constellation-core';
import { createPlanEnvelope, createRunStore, InMemoryConstellationRunStore, planToTopology } from '@data/recovery-cockpit-constellation-store';
import type { ConstellationTopology } from '@domain/recovery-cockpit-constellation-core';
import type {
  OrchestratorInput,
  OrchestratorRuntime,
  OrchestratorResponse,
  StageEnvelope,
} from './types';
import { buildPlugins, buildStageInput, stageList } from './adapters';
import { buildTimelineSeries } from './timeline';

const makeRunId = (seed: string): ConstellationRunId => `run:${seed}` as ConstellationRunId;
const makeTemplateId = (seed: string): ConstellationTemplateId => `template:${seed}` as ConstellationTemplateId;
const metricsByBucket = Object.fromEntries(
  ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'].map((stage) => [`bucket:${stage}`, 0]),
) as Record<string, number>;

type StageExecutionRecord = {
  readonly stage: ConstellationStage;
  readonly plugin: ConstellationPlugin;
  readonly startedAt: string;
  readonly events: readonly ConstellationEvent[];
  readonly score: number;
  readonly output: unknown;
};

type AsyncDisposableContract = {
  use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
  [Symbol.asyncDispose](): PromiseLike<void>;
};

const getAsyncStack = (): new () => AsyncDisposableContract => {
  const fallback = class FallbackAsyncDisposableStack {
    readonly #stack: Array<() => Promise<void>> = [];
    use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T {
      const disposer = value?.[Symbol.asyncDispose];
      if (typeof disposer === 'function') {
        this.#stack.push(() => Promise.resolve(disposer.call(value)));
      }
      return value;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#stack.length > 0) {
        const pop = this.#stack.pop();
        if (pop) {
          await pop();
        }
      }
    }
  };

  return (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableContract }).AsyncDisposableStack ?? fallback;
};

const toResponse = (runId: ConstellationRunId, status: OrchestratorResponse['status']): OrchestratorResponse => ({
  requestId: runId,
  status,
  startedAt: buildConstellationTimestampBrand(),
  phase: status === 'complete' ? 'finalize' : 'bootstrap',
});

const buildContext = (runId: ConstellationRunId, topology: ConstellationTopology, stage: ConstellationStage): ConstellationContext => ({
  runId,
  stage,
  startedAt: toTimestamp(new Date()),
  runbookId: topology.nodes.length.toString(),
  correlationId: `${runId}:${stage}`,
});

const scoreFromEvents = (events: readonly ConstellationEvent[]): number => {
  const metric = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.kind] = (acc[event.kind] ?? 0) + event.message.length;
    return acc;
  }, {});
  const base = metric.metric ?? 0;
  return Math.min(100, Math.max(0, base));
};

const toEnvelope = (
  stage: ConstellationStage,
  plugin: ConstellationPlugin,
  startedAt: string,
  score: number,
  events: readonly ConstellationEvent[],
  output: unknown,
): StageEnvelope => ({
  stage,
  startedAt,
  pluginId: plugin.id,
  score,
  result: {
    output: output as never,
    events,
    metrics: {
      ...metricsByBucket,
      [`bucket:${stage}`]: score,
    },
  },
});

export class RecoveryCockpitConstellationOrchestrator implements AsyncDisposable {
  #store: Promise<InMemoryConstellationRunStore>;
  readonly #stack = new (getAsyncStack())();
  readonly #registry: ConstellationPluginRegistry;
  readonly #seed: ConstellationTemplateId;
  #lastTopology?: ConstellationTopology;

  constructor(private readonly input: OrchestratorInput) {
    this.#store = createRunStore();
    this.#seed = makeTemplateId(input.constellationId);
    this.#registry = new ConstellationPluginRegistry(buildPlugins());
  }

  async run(
    options: NoInfer<OrchestratorInput> = this.input,
  ): Promise<Result<OrchestratorRuntime, string>> {
    if (options.plan.actions.length === 0) {
      return fail('input-empty');
    }

    const store = await this.#store;
    const runId = makeRunId(`${options.constellationId}:${Date.now()}`);
    const topology = planToTopology(options.plan);
    this.#lastTopology = topology;
    const selected = options.preferredPath?.length ? options.preferredPath : inferDefaultPath(topology);
    const path = selected.length ? selected : stageList;
    const ordered = [...new Set(path)] as readonly ConstellationStage[];
    const baseContext = buildContext(runId, topology, ordered[0] ?? 'bootstrap');

    const stageRecords: StageExecutionRecord[] = [];
    for (const stage of ordered) {
      const plugin = this.#registry.byKind(stage)[0];
      if (!plugin) continue;

      const input = buildStageInput(stage, topology, options.plan);
      const runContext: ConstellationContext = {
        ...baseContext,
        stage,
        correlationId: `${baseContext.correlationId}:${plugin.id}`,
        runbookId: this.#seed,
      };
      const result = await plugin.execute(input as never, runContext);
      const startedAt = buildConstellationTimestamp();
      const score = scoreFromEvents(result.events);
      stageRecords.push({
        stage,
        plugin,
        startedAt,
        events: result.events,
        score,
        output: result.output,
      });
    }

    const simulation = simulateRun(
      runId,
      topology,
      buildSimulationPath(ordered),
      stageRecords.map((entry) => ({ stage: entry.stage, score: entry.score })),
      stageRecords.flatMap((entry) => entry.events),
    );

    const envelope = createPlanEnvelope(options.plan, topology);
    const storeResult = await store.upsert(runId, options.plan, envelope, options.runMode);
    if (!storeResult.ok) return fail(storeResult.error);

    await store.appendEvent(storeResult.value.runId, {
      at: buildConstellationTimestampBrand(),
      action: 'append',
      correlationId: runId,
      details: `stages:${ordered.length}`,
    });

    const timeline = buildTimelineSeries(storeResult.value);
    const points = stageRecords.flatMap((entry) => entry.events);
    const scores = stageRecords.map((entry) => [entry.stage, entry.score, toTimestamp(new Date())] as const);

    return ok({
      request: options,
      stages: ordered,
      response: toResponse(runId, 'complete'),
      snapshot: storeResult.value,
      envelopes: stageRecords.map((entry) =>
        toEnvelope(entry.stage, entry.plugin, entry.startedAt, entry.score, entry.events, entry.output),
      ),
      simulations: [simulation],
      telemetry: {
        points,
        scores,
      },
      context: {
        runId,
        activeMode: options.runMode,
        topology,
        selectedStages: ordered,
        requestMode: options.mode,
      },
    });
  }

  async inspect(runId: ConstellationRunId): Promise<Result<OrchestratorRuntime | undefined, string>> {
    const store = await this.#store;
    const snapshot = await store.get(runId);
    if (!snapshot.ok) return fail(snapshot.error);
    if (!snapshot.value) return ok(undefined);

    const snapshotValue = snapshot.value;
    const topology = { nodes: snapshotValue.topologyNodes, edges: [] as const };
    const stages = inferDefaultPath(topology);
    const timeline = buildTimelineSeries(snapshotValue);
    return ok({
      request: this.input,
      stages,
      response: {
        requestId: runId,
        status: 'complete',
        startedAt: snapshotValue.createdAt,
        phase: 'review',
      },
      snapshot: snapshotValue,
      envelopes: [],
      simulations: [],
      telemetry: {
        points: timeline.samples.map((sample, index) => ({
          kind: index % 2 === 0 ? 'metric' : 'plan',
          message: `${snapshotValue.runId}:${sample.count}`,
          timestamp: toTimestamp(new Date(sample.at)),
          tags: [snapshotValue.runId],
        })),
        scores: timeline.samples.map((sample, index) => [stages[index % stages.length] ?? 'bootstrap', sample.count, sample.at]),
      },
      context: {
        runId: snapshotValue.runId,
        activeMode: snapshotValue.mode,
        topology,
        selectedStages: stages,
        requestMode: this.input.mode,
      },
    });
  }

  async bootstrap(): Promise<Result<Record<ConstellationMode, number>, string>> {
    const store = await this.#store;
    return store.summarizeByMode();
  }

  async dispose(): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }
}

export const createConstellationOrchestrator = async (
  input: OrchestratorInput,
): Promise<RecoveryCockpitConstellationOrchestrator> => new RecoveryCockpitConstellationOrchestrator(input);
