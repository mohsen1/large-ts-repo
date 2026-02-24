import { withBrand } from '@shared/core';
import { toNamespace } from '@shared/incident-saga-core';
import type { PluginOutput, SagaEventEnvelope, SagaPhase, SagaPluginDefinition } from '@shared/incident-saga-core';
import type { SagaPlan, SagaPolicy, SagaRun } from '@domain/recovery-incident-saga';

export interface PluginRuntimeContext {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
  readonly policy: SagaPolicy;
  readonly sink: {
    emit(event: SagaEventEnvelope): void;
  };
  readonly runtime: {
    readonly runtimeId: string;
    readonly tenant: string;
  };
}

export interface ValidationPlugin {
  validateRun(run: SagaRun): Promise<boolean>;
  validatePlan(plan: SagaPlan): Promise<boolean>;
}

export interface ReplayPlugin {
  replay(): Promise<number>;
}

export interface DispatchPlugin {
  dispatch(event: SagaEventEnvelope): Promise<void>;
  reset(): Promise<void>;
}

export interface SagaRuntimePlugins {
  validation: ValidationPlugin;
  replay: ReplayPlugin;
  dispatch: DispatchPlugin;
}

export type SagaPluginDefinitions = {
  validation: SagaPluginDefinition<'validation', object, unknown>;
  replay: SagaPluginDefinition<'replay', object, unknown>;
  dispatch: SagaPluginDefinition<'dispatch', object, unknown>;
};

const createValidationRuntime = (context: PluginRuntimeContext): ValidationPlugin => {
  const namespace = toNamespace(context.run.domain);
  const buildKind = <TPhase extends SagaPhase>(phase: TPhase): `${typeof namespace}::${TPhase}` => `${namespace}::${phase}`;

  return {
    validateRun: async (run) => {
      context.sink.emit({
        eventId: withBrand(`validate-run-${run.id}`, `event:${namespace}`),
        namespace,
        kind: buildKind('prepare'),
        payload: { runId: run.id },
        recordedAt: new Date().toISOString(),
        tags: ['tag:prepare'],
      });
      return Boolean(run.id && run.policyId && run.steps.length >= 0);
    },
    validatePlan: async (plan) => {
      context.sink.emit({
        eventId: withBrand(`validate-plan-${plan.runId}`, `event:${namespace}`),
        namespace,
        kind: buildKind('prepare'),
        payload: { stepCount: plan.steps.length },
        recordedAt: new Date().toISOString(),
        tags: ['tag:prepare'],
      });
      return plan.steps.length > 0 || plan.edges.length > 0;
    },
  };
};

const createReplayRuntime = (context: PluginRuntimeContext): ReplayPlugin => {
  const namespace = toNamespace(context.run.domain);
  const buildKind = <TPhase extends SagaPhase>(phase: TPhase): `${typeof namespace}::${TPhase}` => `${namespace}::${phase}`;
  const events: SagaEventEnvelope[] = [];

  return {
    replay: async () => {
      context.sink.emit({
        eventId: withBrand(`replay-${context.runtime.runtimeId}`, `event:${namespace}`),
        namespace,
        kind: buildKind('execute'),
        payload: { events: events.length },
        recordedAt: new Date().toISOString(),
        tags: ['tag:execute'],
      });
      return events.length;
    },
  };
};

const createDispatchRuntime = (context: PluginRuntimeContext): DispatchPlugin => {
  const namespace = toNamespace(context.run.domain);
  const buildKind = <TPhase extends SagaPhase>(phase: TPhase): `${typeof namespace}::${TPhase}` => `${namespace}::${phase}`;
  const active = new Set<string>();

  return {
    dispatch: async (event) => {
      active.add(`${event.eventId}`);
      context.sink.emit({
        eventId: withBrand(`dispatch-${event.eventId}`, `event:${namespace}`),
        namespace,
        kind: buildKind('audit'),
        payload: { activeCount: active.size },
        recordedAt: new Date().toISOString(),
        tags: ['tag:audit'],
      });
    },
    reset: async () => {
      active.clear();
    },
  };
};

const pluginRuntimePluginName = (value: string): `plugin:${string}` => `plugin:${value}`;

export const createDefaultPlugins = (context: PluginRuntimeContext): SagaPluginDefinitions => {
  const validation = createValidationRuntime(context);
  const replay = createReplayRuntime(context);
  const dispatch = createDispatchRuntime(context);

  return {
    validation: {
      pluginName: pluginRuntimePluginName('validation'),
      dependencies: ['plugin:dispatch'],
    setup: async () =>
        Promise.resolve<PluginOutput<{ runtime: ValidationPlugin }>>({
          pluginId: pluginRuntimePluginName('validation'),
          ready: true,
          startedAt: new Date().toISOString(),
          output: { runtime: validation },
        }),
      teardown: async (runtimeContext, output: PluginOutput<unknown>) => {
        const resolvedContext = runtimeContext as PluginRuntimeContext;
        const typedOutput = output as PluginOutput<{ runtime: ValidationPlugin }>;
        await typedOutput.output.runtime.validateRun(resolvedContext.run);
      },
    },
    replay: {
      pluginName: pluginRuntimePluginName('replay'),
      dependencies: ['plugin:validation'],
      setup: async () =>
        Promise.resolve<PluginOutput<{ runtime: ReplayPlugin }>>({
          pluginId: pluginRuntimePluginName('replay'),
          ready: true,
          startedAt: new Date().toISOString(),
          output: { runtime: replay },
        }),
      teardown: async () => {
        await replay.replay();
      },
    },
    dispatch: {
      pluginName: pluginRuntimePluginName('dispatch'),
      dependencies: [],
      setup: async () =>
        Promise.resolve<PluginOutput<{ runtime: DispatchPlugin }>>({
          pluginId: pluginRuntimePluginName('dispatch'),
          ready: true,
          startedAt: new Date().toISOString(),
          output: { runtime: dispatch },
        }),
      teardown: async () => {
        await dispatch.reset();
      },
    },
  };
};
