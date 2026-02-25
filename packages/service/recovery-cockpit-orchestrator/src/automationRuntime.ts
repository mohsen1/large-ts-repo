import { Brand } from '@shared/type-level';
import { type Result, fail, ok } from '@shared/result';
import {
  type AutomationBlueprint,
  type AutomationBlueprintStep,
  type AutomationTier,
  type PluginId,
  type RecoveryCockpitPluginDescriptor,
  type PluginRunResult,
} from '@domain/recovery-cockpit-orchestration-core';
import {
  AutomationSignalBus,
  publishAutomationFinished,
  publishAutomationStarted,
  publishStepFailed,
  publishStepFinished,
  publishStepStarted,
} from '@data/recovery-cockpit-store';

export type RuntimeContext = {
  readonly tenant: Brand<string, 'Tenant'>;
  readonly runId: Brand<string, 'RunId'>;
  readonly user: string;
};

export type StepExecution = {
  readonly stepId: AutomationBlueprintStep<RecoveryCockpitPluginDescriptor<PluginId, AutomationTier>>['stepId'];
  readonly elapsedMs: number;
  readonly result: PluginRunResult<unknown>;
};

export type RuntimeResult = {
  readonly runId: Brand<string, 'RunId'>;
  readonly state: 'ok' | 'degraded' | 'failed';
  readonly steps: readonly StepExecution[];
  readonly totalMs: number;
};

export type RuntimeConfig = {
  readonly stopOnFailure: boolean;
  readonly maxSteps: number;
};

const defaultConfig: RuntimeConfig = {
  stopOnFailure: true,
  maxSteps: 20,
};

const toArray = <T>(value: Iterable<T>): T[] => {
  const out: T[] = [];
  for (const item of value) {
    out.push(item);
  }
  return out;
};

const stageWeight = (stage: AutomationTier): number => {
  switch (stage) {
    case 'discover':
      return 1;
    case 'compose':
      return 2;
    case 'execute':
      return 4;
    case 'verify':
      return 3;
    case 'audit':
      return 5;
    default:
      return 1;
  }
};

export class AutomationRuntime<TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationTier>> {
  readonly #blueprint: AutomationBlueprint<TDescriptor>;
  readonly #context: RuntimeContext;
  readonly #bus: AutomationSignalBus;
  readonly #config: RuntimeConfig;

  constructor(blueprint: AutomationBlueprint<TDescriptor>, context: RuntimeContext, config: RuntimeConfig = defaultConfig) {
    this.#blueprint = blueprint;
    this.#context = context;
    this.#bus = new AutomationSignalBus();
    this.#config = config;
  }

  get bus(): AutomationSignalBus {
    return this.#bus;
  }

  async #runStep(step: AutomationBlueprintStep<TDescriptor>): Promise<StepExecution> {
    const started = Date.now();
    publishStepStarted(this.#bus, this.#context.tenant, `${this.#context.runId}:${step.stepId}` as Brand<string, 'TraceId'>, step.plugin, step.stepId);

    const execution = await step.plugin.run({} as never, {
      tenant: this.#context.tenant,
      operator: this.#context.user,
      requestId: `${this.#context.tenant}:${this.#context.runId}` as Brand<string, 'RequestId'>,
      featureFlags: new Set(),
    });

    const elapsed = Date.now() - started;
    const result = {
      ...execution,
      metrics: {
        ...execution.metrics,
        elapsedMs: elapsed,
        stageWeight: stageWeight(step.plugin.stage),
      },
    };

    const output = {
      stepId: step.stepId,
      elapsedMs: elapsed,
      result,
    };

    if (execution.state === 'failed') {
      publishStepFailed(
        this.#bus,
        this.#context.tenant,
        `${this.#context.runId}:${step.stepId}` as Brand<string, 'TraceId'>,
        step.stepId,
        execution.errors,
      );
    } else {
      publishStepFinished(this.#bus, this.#context.tenant, `${this.#context.runId}:${step.stepId}` as Brand<string, 'TraceId'>, {
        ...result,
        stepId: step.stepId,
      });
    }

    return output;
  }

  async run(): Promise<Result<RuntimeResult, Error>> {
    const started = Date.now();
    publishAutomationStarted(this.#bus, this.#blueprint, this.#context.tenant, `${this.#context.runId}` as Brand<string, 'TraceId'>);

    const stack = new AsyncDisposableStack();
    const spanTrace: string[] = [];

    class RuntimeSpan implements AsyncDisposable {
      constructor(private readonly label: string, private readonly trace: string[]) {
        trace.push(`start:${label}`);
      }
      async [Symbol.asyncDispose](): Promise<void> {
        this.trace.push(`end:${this.label}`);
      }
    }

    try {
      await using _span = new RuntimeSpan('runtime', spanTrace);
      const steps = toArray(this.#blueprint.steps).slice(0, this.#config.maxSteps);
      const trace: StepExecution[] = [];

      for (const step of steps) {
        stack.use(_span);
        const result = await this.#runStep(step);
        trace.push(result);
        if (result.result.state === 'failed' && this.#config.stopOnFailure) {
          break;
        }
      }

      const state: RuntimeResult['state'] =
        trace.some((entry) => entry.result.state === 'failed')
          ? 'failed'
          : trace.some((entry) => entry.result.state === 'warning')
            ? 'degraded'
            : 'ok';

      const totalMs = Date.now() - started;
      publishAutomationFinished(
        this.#bus,
        this.#context.tenant,
        `${this.#context.runId}` as Brand<string, 'TraceId'>,
        this.#blueprint,
        state === 'degraded' ? 'degraded' : 'ok',
        totalMs,
      );

      await stack[Symbol.asyncDispose]();
      return ok({ runId: this.#context.runId, state, steps: trace, totalMs });
    } catch (error) {
      return fail(error as Error);
    }
  }
}

export const createAutomationRuntime = <
  TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationTier>,
>(
  blueprint: AutomationBlueprint<TDescriptor>,
  context: RuntimeContext,
): AutomationRuntime<TDescriptor> => {
  const runId = `${context.tenant}:${context.user}:${Date.now()}` as Brand<string, 'RunId'>;
  return new AutomationRuntime<TDescriptor>({
    ...blueprint,
    header: {
      ...blueprint.header,
      blueprintName: `${blueprint.header.blueprintName} | ${runId}`,
    },
  }, { ...context, runId });
};

export const summarizeRuntime = (result: RuntimeResult): {
  readonly totalSteps: number;
  readonly warnings: number;
  readonly state: RuntimeResult['state'];
} => ({
  totalSteps: result.steps.length,
  warnings: result.steps.filter((entry) => entry.result.state === 'warning').length,
  state: result.state,
});
