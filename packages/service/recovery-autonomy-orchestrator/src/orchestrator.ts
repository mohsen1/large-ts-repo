import {
  AUTONOMY_SCOPE_SEQUENCE,
  asRunId,
  toDiagnosticSignal,
  type AutonomyScope,
  type AutonomySignalEnvelope,
  type AutonomySignalInput,
  type AutonomyExecutionOutput,
  type AutonomyPlan,
} from '@domain/recovery-autonomy-graph';
import { AutonomyPluginRegistry } from '@domain/recovery-autonomy-graph';
import { withBrand } from '@shared/core';
import { buildBlueprint, type PlanWindow } from '@domain/recovery-autonomy-graph/planner';
import { AutonomyRunStore } from '@data/recovery-autonomy-store';
import { buildRunAnalytics, buildRunSummary } from './analytics';
import { executePlan } from './pipeline';
import { err, ok, type Result } from '@shared/result';
import {
  defaultRequestClock,
  type OrchestratorOptions,
  type OrchestrationResult,
  type OrchestrationRunState,
  type RunExecutionRequest,
} from './types';

interface SessionPlan {
  readonly plan: AutonomyPlan;
  readonly diagnostics: {
    readonly stageCount: number;
    readonly chain: readonly AutonomyScope[];
    readonly ordered: readonly string[];
  };
}

const expandWindow = (scope: AutonomyScope): PlanWindow<readonly [AutonomyScope, ...AutonomyScope[]]> => {
  const scopes = [scope, ...AUTONOMY_SCOPE_SEQUENCE.filter((entry) => entry !== scope)] as const;
  return {
    stages: scopes,
    signature: withBrand(`signature:${scopes.join(':')}`, 'AutonomyWindowSignature'),
  };
};

const buildSession = (request: RunExecutionRequest): SessionPlan => {
  const requestWindow = expandWindow(request.scope);
  const plan = buildBlueprint(asRunId(request.seed), String(request.graphId), requestWindow.stages);
  const registry = new AutonomyPluginRegistry();
  const diagnostics = {
    stageCount: plan.stages.length,
    chain: [...plan.stages],
    ordered: [...registry.snapshot().scopes],
  };
  return { plan, diagnostics };
};

const buildRequestInput = (request: RunExecutionRequest): AutonomySignalInput => ({
  scope: request.scope,
  graphId: request.graphId,
  runId: asRunId(request.seed),
  source: request.owner,
  payload: request.payload,
  channel: 'telemetry',
  tags: request.tags ?? ['manual'],
});

class AutonomyRuntime {
  #registry: AutonomyPluginRegistry;
  #store: AutonomyRunStore;
  #plan?: AutonomyPlan;

  constructor(registry: AutonomyPluginRegistry, store: AutonomyRunStore) {
    this.#registry = registry;
    this.#store = store;
  }

  public async run(request: RunExecutionRequest, options: OrchestratorOptions = {}): Promise<OrchestrationResult> {
    const abort = new AbortController().signal;
    const session = buildSession(request);
    const input = buildRequestInput(request);
    this.#plan = session.plan;

    const result = await executePlan(this.#plan, input, this.#registry, abort);
    const signals = result.signals as readonly AutonomySignalEnvelope[];
    const outputs = result.outputs as readonly AutonomyExecutionOutput[];

    if (!signals.length) {
      const fallbackSignal = toDiagnosticSignal(
        input,
        0,
        {
          plugin: 'runtime',
          scope: request.scope,
        },
      );
      const summaryState: OrchestrationRunState = {
        completed: false,
        plan: this.#plan,
        signals: [fallbackSignal],
        outputs: [],
      };
      return {
        ok: false,
        error: new Error('No signals produced'),
        summary: summaryState,
      };
    }

    const totalDuration = result.metrics.reduce((acc, metric) => acc + metric.elapsedMs, 0);
    const totalPlugins = result.metrics.reduce((acc, metric) => acc + metric.pluginCount, 0);
    const state: OrchestrationRunState = {
      completed: true,
      plan: this.#plan,
      signals,
      outputs,
      metrics: {
        requestId: options.maxRetries !== undefined ? `${options.maxRetries}` : defaultRequestClock(),
        runId: input.runId,
        durationMs: totalDuration,
        pluginCount: totalPlugins,
        signalCount: signals.length,
        peakScope: signals.reduce<AutonomyScope>((acc, signal, index, all) => (index === all.length - 1 ? signal.scope : acc), request.scope),
      },
    };

    const analytics = buildRunAnalytics(input.runId, state);

    await this.persist(request, state);

    return {
      ok: true,
      value: state,
      summary: {
        planId: String(state.plan.planId),
        durations: result.metrics.map((metric) => ({
          scope: metric.scope,
          startedAt: metric.startedAt,
          durationMs: metric.elapsedMs,
          signalCount: signals.length,
        })),
        health: buildRunSummary(analytics.scopeBuckets, {
          discover: signals.filter((signal) => signal.scope === 'discover').length,
          simulate: signals.filter((signal) => signal.scope === 'simulate').length,
          assess: signals.filter((signal) => signal.scope === 'assess').length,
          orchestrate: signals.filter((signal) => signal.scope === 'orchestrate').length,
          verify: signals.filter((signal) => signal.scope === 'verify').length,
          heal: signals.filter((signal) => signal.scope === 'heal').length,
        }),
      },
    };
  }

  private async persist(request: RunExecutionRequest, state: OrchestrationRunState): Promise<void> {
    const runId = asRunId(request.seed);
    const requestScopeWindow = [state.plan.stages.includes(request.scope) ? request.scope : state.plan.stages[0]].filter(Boolean);
    for (const signal of state.signals) {
      await this.#store.write({
        runId,
        graphId: request.graphId,
        plan: state.plan,
        scope: signal.scope,
        signal,
        input: signal.input,
      });
    }

    for (const output of state.outputs) {
      if (requestScopeWindow.includes(output.signal.scope)) {
        const derived = toDiagnosticSignal(
          {
            scope: output.signal.scope,
            graphId: request.graphId,
            runId,
            source: request.owner,
            payload: output.output,
            channel: 'telemetry',
            tags: output.signal.input.tags,
          },
          output.signal.score + 1,
          output,
        );

        await this.#store.write({
          runId,
          graphId: request.graphId,
          plan: state.plan,
          scope: derived.scope,
          signal: derived,
          input: derived.input,
        });
      }
    }
  }

  public analyze(): string {
    return String(this.#plan ? this.#plan.planId : 'uninitialized');
  }
}

export class AutonomyService {
  #runtime: AutonomyRuntime;

  constructor(registry: AutonomyPluginRegistry, store: AutonomyRunStore) {
    this.#runtime = new AutonomyRuntime(registry, store);
  }

  public static create(registry = new AutonomyPluginRegistry(), store = new AutonomyRunStore()): AutonomyService {
    return new AutonomyService(registry, store);
  }

  public async run<TPayload extends object>(
    request: RunExecutionRequest<AutonomyScope, TPayload>,
    options?: OrchestratorOptions,
  ): Promise<OrchestrationResult> {
    return this.#runtime.run(request, options);
  }

  public async runWithSummary<TPayload extends object>(
    request: RunExecutionRequest<AutonomyScope, TPayload>,
    options?: OrchestratorOptions,
  ): Promise<Result<{ readonly state: OrchestrationRunState; readonly summary: ReturnType<AutonomyRuntime['analyze']> }>> {
    const result = await this.run(request, options);
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      state: result.value,
      summary: this.#runtime.analyze(),
    });
  }
}

export const createAutonomyOrchestrator = (store: AutonomyRunStore = new AutonomyRunStore()): AutonomyService =>
  new AutonomyService(new AutonomyPluginRegistry(), store);

export { executePlan };
