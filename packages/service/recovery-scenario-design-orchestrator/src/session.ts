import {
  StageTopology,
  type TopologyDiagnostics,
  type StageTemplate,
  type StageResult,
  createRunId,
  createStageId,
  type OrchestrationRunContext,
  type ScenarioTrace,
} from '@domain/recovery-scenario-design';
import type {
  ScenarioDesignInput,
  ScenarioDesignOutput,
  ScenarioRunnerConfig,
  ScenarioDesignEvent,
  RunResult,
} from './types';

export interface ScenarioSessionState {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly active: boolean;
}

const checkpointTemplate = ['started', 'progress', 'finished', 'error'] as const;

type TraceEvent = ScenarioDesignEvent['type'];

export class ScenarioSession<TInput, TOutput> implements AsyncDisposable {
  readonly #topology = new StageTopology<TInput, Record<string, unknown>>();
  readonly #sessionId: string;
  readonly #config: ScenarioRunnerConfig;
  #events: ScenarioDesignEvent[] = [];
  #active = false;
  #closed = false;

  constructor(
    readonly input: ScenarioDesignInput<TInput>,
    config: ScenarioRunnerConfig = { concurrency: 1, attemptLimit: 1 },
  ) {
    this.#sessionId = `session:${input.runId}`;
    this.#config = config;
  }

  get id(): string {
    return this.#sessionId;
  }

  get closed(): boolean {
    return this.#closed;
  }

  get diagnostics(): TopologyDiagnostics {
    return {
      runId: this.input.runId,
      cycleCount: this.#events.length,
      hotspot: this.#topology.nodes()[0],
    };
  }

  async emit(event: ScenarioDesignEvent): Promise<void> {
    this.#events.push(event);
    this.#config.emit?.(event);
  }

  async open(): Promise<void> {
    if (this.#active) {
      return;
    }
    this.#active = true;
    await this.emit({
      type: 'scenario.started',
      scenarioId: this.input.scenarioId,
      runId: this.input.runId,
      timestamp: Date.now(),
      payload: this.input,
    });
  }

  async run(stages: readonly StageTemplate<TInput, TInput, TOutput>[]): Promise<RunResult<TOutput>> {
    const startedAt = Date.now();
    let cursor: TInput | TOutput = this.input.context;

    for (const stage of stages) {
      await this.emit({
        type: 'scenario.progress',
        scenarioId: this.input.scenarioId,
        runId: this.input.runId,
        timestamp: Date.now(),
        payload: this.input,
      });

      const context: OrchestrationRunContext<TInput, TOutput> = {
        scenarioId: this.input.scenarioId,
        runId: this.input.runId,
        startedAt,
        input: this.input.context,
      };

      const trace: ScenarioTrace = {
        namespace: 'scenario-session',
        correlationId: this.input.runId as unknown as ScenarioTrace['correlationId'],
        checkpoints: [checkpointTemplate[0]],
      };

      const stageOutput: StageResult<TOutput> = await stage.adapter.transform(
        context,
        cursor as TInput,
        trace,
      );

      if (stageOutput.status === 'ok' && stageOutput.output !== undefined) {
        cursor = stageOutput.output;
      }

      const topology = createTopologyForStage(
        stage.id,
        {
          output: cursor as TOutput,
        },
        stageOutput,
      );
      topology.summarize();
      this.#topology.addVertex({
        id: createStageId(stage.id, 0),
        kind: stage.kind,
        dependsOn: [],
        config: {
          payload: cursor,
          marker: 'session',
        },
        execute: async () => cursor,
      });
    }

    const output = cursor as TOutput;
    await this.emit({
      type: 'scenario.completed',
      scenarioId: this.input.scenarioId,
      runId: this.input.runId,
      timestamp: Date.now(),
      payload: { ...this.input, output },
    });

    return {
      scenarioId: this.input.scenarioId,
      runId: this.input.runId,
      output,
      startedAt,
      finishedAt: Date.now(),
      checkpoints: this.#events.map((entry) => entry.type),
    };
  }

  async close(): Promise<ScenarioDesignOutput<TOutput>> {
    this.#closed = true;
    return {
      runId: this.input.runId,
      startedAt: Date.now(),
      status: 'cancelled',
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#closed) {
      await this.close();
    }
  }
}

function createTopologyForStage<TContext, TOutput>(
  id: string,
  payload: { output?: TOutput },
  stageOutput: StageResult<TOutput>,
): StageTopology<TContext, Record<string, unknown>> {
  const topology = new StageTopology<TContext, Record<string, unknown>>();
  topology.addVertex({
    id: createStageId(id, 0),
    kind: 'verification',
    dependsOn: [],
    config: {
      marker: 'session',
      output: payload.output,
    },
    execute: async () => payload,
  });
  topology.addVertex({
    id: createStageId(id, 1),
    kind: 'audit',
    dependsOn: [createStageId(id, 0)],
    config: { marker: 'audit', stageResult: stageOutput.status },
    execute: async () => ({ status: stageOutput.status, output: payload.output }),
  });
  topology.addEdge({
    from: createStageId(id, 0),
    to: createStageId(id, 1),
    weight: 1 as number & { readonly __brand: 'StageTransitionWeight' },
    condition: 'when.active',
  });
  return topology;
}

export function createSessionOutput<TInput, TOutput>(
  session: ScenarioSession<TInput, TOutput>,
  output: TOutput,
): ScenarioDesignOutput<TOutput> {
  return {
    runId: createRunId(session.id, BigInt(session.diagnostics.cycleCount)),
    startedAt: session.diagnostics.cycleCount,
    finishedAt: Date.now(),
    output,
    status: 'succeeded',
  };
}

export const buildTraceTemplate = (type: TraceEvent) => ({
  type,
  issuedAt: Date.now(),
} as const);
