import { randomUUID } from 'node:crypto';
import { OwnedDisposableStack } from '@shared/type-level';
import {
  ConvergenceContext,
  ConvergencePluginDescriptor,
  ConvergenceLifecycle,
  ConvergenceRunId,
  ConvergenceSummary,
  ConvergenceStudioId,
  ConvergencePlanId,
  ConvergenceStage,
  normalizeConvergenceTag,
  normalizePlanId,
  normalizeStudioId,
  normalizeRunId,
} from './types';
import { buildPlan, describePlan, buildPlanDigest, type PlanBlueprintStep, type PlanRuntime } from './plan';
import { buildConvergenceMap } from './types';

export interface ExecutorReport {
  readonly runId: ConvergenceRunId;
  readonly planId: ConvergencePlanId;
  readonly lifecycle: ConvergenceLifecycle;
  readonly summary: ConvergenceSummary;
  readonly elapsedMs: number;
}

export interface ExecutorOptions {
  readonly timeoutMs: number;
  readonly parallel: boolean;
}

export interface ExecutorResult {
  readonly status: 'ok' | 'degraded' | 'error';
  readonly result: string;
}

interface RuntimeScope {
  readonly runId: ConvergenceRunId;
  readonly startAt: number;
  readonly context: ConvergenceContext;
  readonly planId: ConvergencePlanId;
}

const defaultOptions: ExecutorOptions = {
  timeoutMs: 5_000,
  parallel: false,
};

const toSummary = (
  context: ConvergenceContext,
  plan: PlanRuntime,
  sequence: readonly PlanBlueprintStep[],
  result: ConvergenceSummary['diagnostics'],
): ConvergenceSummary => ({
  runId: context.runId,
  workspaceId: context.workspaceId,
  stageTrail: [...new Set(plan.sequence.map((step) => step.stage))],
  selectedPlugins: sequence.map((entry) => entry.plugin.id),
  score: Math.min(1, sequence.length / 10),
  tags: [normalizeConvergenceTag(context.tenant), normalizeConvergenceTag(context.workspaceId)],
  diagnostics: result,
});

export class ConvergenceExecutor {
  readonly #stack = new OwnedDisposableStack('convergence-executor');
  readonly #scope: RuntimeScope;
  #resolved = false;
  #status: ExecutorResult['status'] = 'error';

  constructor(
    studioId: ConvergenceStudioId,
    private readonly plugins: readonly ConvergencePluginDescriptor[],
    private readonly options: ExecutorOptions = defaultOptions,
  ) {
    const runId = normalizeRunId(`run:${studioId}:${randomUUID()}`);
    const context: ConvergenceContext = {
      workspaceId: normalizeStudioId(studioId),
      tenant: `${studioId}`,
      runId,
      mode: 'observe',
      startedAt: new Date().toISOString(),
    };

    this.#scope = {
      runId,
      startAt: Date.now(),
      context,
      planId: normalizePlanId(`plan:${studioId}:${Date.now()}`),
    };
  }

  async execute(): Promise<ExecutorResult> {
    const plan = buildPlan({
      plugins: this.plugins,
      studioId: this.#scope.context.workspaceId,
      runId: this.#scope.runId,
      lifecycle: 'running',
    });
    using _scope = this.#stack;
    const sequence = plan.sequence;
    const diagnostics: string[] = [];
    const pluginByStage = buildConvergenceMap(sequence.map((step) => step.plugin));
    void pluginByStage;

    const invocations = sequence.map((step) => this.#invokeStep(step, diagnostics));
    if (this.options.parallel) {
      await Promise.all(invocations);
    } else {
      for (const invocation of invocations) {
        await invocation;
      }
    }

    this.#resolved = true;
    this.#status = 'ok';
    void this.#status;

    const summary = describePlan(plan);
    return {
      status: 'ok',
      result: `${buildPlanDigest(plan)}::${diagnostics.length}::${summary.steps}`,
    };
  }

  async report(): Promise<ExecutorReport> {
    const plan = buildPlan({
      plugins: this.plugins,
      studioId: this.#scope.context.workspaceId,
      runId: this.#scope.runId,
      lifecycle: this.#resolved ? 'complete' : 'degraded',
    });
    const diagnostics = describePlan(plan);
    const summary = toSummary(this.#scope.context, plan, plan.sequence, diagnostics.diagnostics);
    return {
      runId: this.#scope.runId,
      planId: this.#scope.planId,
      lifecycle: this.#resolved ? 'complete' : 'degraded',
      summary,
      elapsedMs: Date.now() - this.#scope.startAt,
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }

  async #invokeStep(step: PlanBlueprintStep, diagnostics: string[]): Promise<void> {
    const payload = { id: step.plugin.id, slot: step.slot };
    this.#stack.use({
      [Symbol.dispose]: () => undefined,
      [Symbol.asyncDispose]: async () => {
        diagnostics.push(`stage=${step.stage}::dispose=${step.slot}`);
      },
    });

    await Promise.resolve(
      step.plugin.run(payload as never, {
        workspaceId: this.#scope.context.workspaceId,
        tenant: this.#scope.context.workspaceId,
        runId: this.#scope.runId,
        mode: 'simulate',
        startedAt: this.#scope.context.startedAt,
      }),
    );
  }
}

export interface ExecuteInput {
  readonly studioId: ConvergenceStudioId;
  readonly plugins: readonly ConvergencePluginDescriptor[];
  readonly options?: Partial<ExecutorOptions>;
}

export const executePlan = async (input: ExecuteInput): Promise<ExecutorReport> => {
  const executor = new ConvergenceExecutor(input.studioId, input.plugins, {
    ...defaultOptions,
    ...input.options,
  });
  await executor.execute();
  return executor.report();
};
