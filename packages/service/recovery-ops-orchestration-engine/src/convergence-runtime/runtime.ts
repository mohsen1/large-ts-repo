import { randomUUID } from 'node:crypto';
import { OwnedDisposableStack } from '@shared/type-level';
import {
  ConvergenceStudioId,
  ConvergenceSummary,
  ConvergencePluginDescriptor,
  ConvergenceLifecycle,
} from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';
import { buildPlan } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/plan';
import { StudioTelemetryBus } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/observability';
import { createRunFacade, type ConvergenceRunFacade } from './facade';
import { normalizeRunId, normalizeStudioId, normalizeConvergenceTag } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';
import type {
  ConvergenceRunEnvelope,
  ConvergenceRunMode,
  ConvergenceRunOutput,
  ConvergenceRunPayload,
  RuntimeCheckpoint,
} from './types';
import { toAsyncEventStream } from './telemetry';

export interface RuntimeFactory {
  readonly facade: ConvergenceRunFacade;
  readonly runtimeId: string;
}

interface RuntimeState {
  readonly startedAt: number;
  readonly runId: string;
  readonly lifecycle: ConvergenceLifecycle;
}

const loadRuntimeProfiles = async (): Promise<readonly string[]> => {
  await Promise.resolve();
  return ['core', 'policy', 'runtime'].toSorted();
};

const runLifecycleFromMode = (mode: ConvergenceRunMode): ConvergenceLifecycle =>
  mode === 'dry-run' ? 'queued' : 'running';

export class ConvergenceRuntime {
  readonly #telemetry = new StudioTelemetryBus();
  readonly #stack = new OwnedDisposableStack('convergence-runtime');
  readonly #runtimeId: string;
  #state: RuntimeState | null = null;

  constructor(
    private readonly runtimeId: string,
    private readonly facade: ConvergenceRunFacade,
  ) {
    this.#runtimeId = runtimeId;
  }

  async run(input: {
    readonly studioId: ConvergenceStudioId;
    readonly requestedBy: string;
    readonly plugins: readonly ConvergencePluginDescriptor[];
    readonly lifecycle?: ConvergenceLifecycle;
    readonly mode?: ConvergenceRunMode;
    readonly labels?: readonly string[];
  }): Promise<ConvergenceRunOutput> {
    const profiles = await loadRuntimeProfiles();
    const runId = randomUUID();
    const brandedRunId = normalizeRunId(`runtime:${this.#runtimeId}:${runId}`);
    const lifecycle = input.lifecycle ?? runLifecycleFromMode(input.mode ?? 'live');
    this.#state = { startedAt: Date.now(), runId: brandedRunId, lifecycle };

    this.#telemetry.pushTrace(brandedRunId, {
      step: 'runtime-start',
      count: input.plugins.length,
      profiles: profiles.join(','),
      stage: lifecycle,
    });

    const facadeOutput = await this.facade.start({
      studioId: input.studioId,
      requestedBy: input.requestedBy,
      mode: input.mode ?? 'live',
      pluginIds: input.plugins.map((plugin) => plugin.id),
      labels: [...(input.labels ?? []), this.#runtimeId],
      modeOptions: {
        parallel: lifecycle === 'running',
        timeoutMs: 12_000,
      },
    });

    const plan = buildPlan({
      plugins: input.plugins,
      studioId: input.studioId,
      runId: brandedRunId,
      lifecycle,
    });

    const runSummary = await this.#attachSummary(plan, facadeOutput, brandedRunId);
    this.#telemetry.pushMetric(brandedRunId, {
      status: facadeOutput.report.status,
      elapsed: facadeOutput.report.elapsedMs,
      tags: runSummary.tags.join(','),
    });

    const envelope: ConvergenceRunEnvelope = {
      studioId: input.studioId,
      runId: brandedRunId,
      mode: input.mode ?? 'live',
      requestedBy: input.requestedBy,
      createdAt: new Date(this.#state.startedAt).toISOString(),
    };

    const payload: ConvergenceRunPayload = {
      runId: brandedRunId,
      summary: runSummary,
      lifecycle,
      selected: input.plugins,
      activeStages: plan.sequence.map((entry) => entry.stage),
    };

    return {
      envelope,
      payload,
      report: {
        ...facadeOutput.report,
        elapsedMs: Date.now() - this.#state.startedAt,
      },
    };
  }

  async stream(runId: string): Promise<ReadonlyMap<number, string>> {
    const events = this.#telemetry.window(normalizeRunId(runId), this.#state?.lifecycle ?? 'running');
    const summary = await this.#summarizeEvents(toAsyncEventStream(events.events));
    return new Map(summary.map((entry, index) => [index, entry] as const));
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#telemetry.clear();
    return this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    void this.#stack[Symbol.asyncDispose]();
  }

  async #summarizeEvents(events: AsyncIterable<{ kind: 'trace' | 'metric' | 'error'; runId: string; at: number; payload: Record<string, unknown> }>): Promise<string[]> {
    const out: string[] = [];
    for await (const event of events) {
      const run = event.runId.split(':').at(-1) ?? event.runId;
      out.push(`${event.kind}:${run}:${event.payload ? Object.keys(event.payload).length : 0}`);
    }
    return out.toSorted();
  }

  async #attachSummary(
    plan: ReturnType<typeof buildPlan>,
    output: ConvergenceRunOutput,
    runId: string,
  ): Promise<ConvergenceSummary> {
    const stageTrail = [...new Set(plan.sequence.map((entry) => entry.stage))];
    const tags = [...output.payload.summary.tags, normalizeConvergenceTag(runId), normalizeConvergenceTag(this.#runtimeId)] as const;

    return {
      runId: output.payload.runId,
      workspaceId: output.envelope.studioId,
      stageTrail,
      selectedPlugins: output.payload.selected.map((plugin) => plugin.id),
      score: Math.min(1, stageTrail.length / 10 + output.report.elapsedMs / 10000),
      tags,
      diagnostics: [
        ...output.payload.summary.diagnostics,
        `runtime=${this.#runtimeId}`,
        `phases=${plan.sequence.length}`,
      ],
    };
  }

  resolve(state: RuntimeState | null): RuntimeState | null {
    return state;
  }
}

export interface RuntimeInput {
  readonly facade: ConvergenceRunFacade;
}

export const createRuntime = (input: RuntimeInput): ConvergenceRuntime => {
  const runtimeId = `runtime-${randomUUID()}`;
  return new ConvergenceRuntime(runtimeId, input.facade);
};

export const withRuntime = async <TResult>(
  facade: ConvergenceRunFacade,
  callback: (runtime: ConvergenceRuntime) => Promise<TResult>,
): Promise<TResult> => {
  const runtime = createRuntime({ facade });
  using _runtime = runtime;
  return callback(runtime);
};

export const runtimeFactory = async (): Promise<RuntimeFactory> => {
  const facade = createRunFacade({
    async resolver() {
      return [];
    },
    logger: (_checkpoint: RuntimeCheckpoint) => {
      return;
    },
  });
  return {
    facade,
    runtimeId: `runtime-${randomUUID()}`,
  };
};
