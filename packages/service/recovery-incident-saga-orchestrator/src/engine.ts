import type { Result } from '@shared/type-level';
import { withScopedAsyncResource, SagaErrorScope } from '@shared/incident-saga-core';
import type { SagaEventEnvelope, SagaPhase, SagaNamespace } from '@shared/incident-saga-core';
import { withBrand } from '@shared/core';
import type { SagaPlan, SagaRun, SagaPolicy } from '@domain/recovery-incident-saga';

export interface ExecutionContext {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
  readonly policy: SagaPolicy;
  readonly runtimeId: string;
}

export interface ExecutionState {
  readonly progress: number;
  readonly errors: SagaErrorScope[];
  readonly events: readonly SagaEventEnvelope[];
  readonly phase: SagaPhase;
}

export type EngineStep = {
  readonly id: string;
  readonly description: string;
  readonly run: (input: ExecutionContext) => Promise<ExecutionState>;
};

export interface EngineMetrics {
  readonly stepCount: number;
  readonly stepOrder: readonly string[];
}

export class SagaEngine<TState extends { stepIndex: number } = { stepIndex: 0 }> {
  readonly #context: ExecutionContext;
  readonly #steps: EngineStep[];
  #state: TState;

  constructor(context: ExecutionContext, steps: EngineStep[]) {
    this.#context = context;
    this.#steps = steps;
    this.#state = { stepIndex: 0 } as TState;
  }

  get context(): ExecutionContext {
    return this.#context;
  }

  get state(): TState {
    return this.#state;
  }

  async execute(): Promise<Result<ExecutionState, Error>> {
    return withScopedAsyncResource(async () => {
      let aggregate: ExecutionState = { progress: 0, errors: [], events: [], phase: 'prepare' };
      for (const step of this.#steps) {
        try {
          const output = await step.run(this.#context);
          aggregate = {
            progress: aggregate.progress + output.progress,
            errors: [...aggregate.errors, ...output.errors],
            events: [...aggregate.events, ...output.events],
            phase: output.phase,
          };
          this.#state = { ...this.#state, stepIndex: this.#state.stepIndex + 1 };
        } catch (error) {
          aggregate.errors.push({
            code: 'E_STEP',
            plugin: step.id,
            phase: 'audit',
            message: error instanceof Error ? error.message : 'step-failed',
            seenAt: new Date().toISOString(),
          });
          return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      }
      return { ok: true, value: { ...aggregate, progress: Math.min(100, aggregate.progress) } };
    });
  }

  with<T>(updater: (state: TState) => T): T {
    return updater(this.#state);
  }
}

export const buildEngineSteps = (context: ExecutionContext): EngineStep[] => {
  const namespace = `saga:${context.run.domain}` as SagaNamespace;
  const makeEvent = (kind: string, phase: SagaPhase, payload: unknown): SagaEventEnvelope<SagaNamespace, unknown> => ({
    eventId: withBrand(`${context.run.id}-${kind}-${context.runtimeId}`, `event:${namespace}`),
    namespace,
    kind: `${namespace}::${phase}`,
    payload,
    recordedAt: new Date().toISOString(),
    tags: [`tag:${phase}`],
  });

  return [
    {
      id: `${context.runtimeId}-prepare`,
      description: 'prepare execution context',
      run: async () => ({
        progress: 10,
        errors: [],
        events: [
          makeEvent('prepare', 'prepare', {
            runId: context.run.id,
            planId: context.plan.runId,
            policyId: context.policy.id,
          }),
        ],
        phase: 'prepare',
      }),
    },
    {
      id: `${context.runtimeId}-activate`,
      description: 'activate plugins',
      run: async () => ({
        progress: 25,
        errors: [],
        events: [
          makeEvent('activate', 'activate', {
            steps: context.plan.steps.length,
          }),
        ],
        phase: 'activate',
      }),
    },
    {
      id: `${context.runtimeId}-execute`,
      description: 'execute graph steps',
      run: async () => ({
        progress: 40,
        errors: [],
        events: context.plan.steps.map((step, index) => makeEvent(`execute-${index}`, 'execute', { stepId: step.id })),
        phase: 'execute',
      }),
    },
    {
      id: `${context.runtimeId}-audit`,
      description: 'collect telemetry',
      run: async () => ({
        progress: 25,
        errors: [],
        events: [
          makeEvent('audit', 'audit', {
            retries: context.run.telemetry?.retries ?? 0,
          }),
        ],
        phase: 'audit',
      }),
    },
  ];
};

export const runEngine = async (context: ExecutionContext): Promise<Result<string, Error>> => {
  const engine = new SagaEngine(context, buildEngineSteps(context));
  const output = await engine.execute();
  return output.ok ? { ok: true, value: `progress=${output.value.progress}` } : { ok: false, error: output.error };
};
