import { withBrand } from '@shared/core';
import { LatticeContext, BrandedTraceId, LatticeRunId, LatticeTenantId } from './ids';
import { PluginByKind, PluginEnvelope, PluginKind } from './plugin';
import type { NoInfer } from '@shared/type-level';

export type StageState = 'queued' | 'ready' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type StageKind = 'extract' | 'evaluate' | 'synthesize' | 'publish' | 'verify';

export interface StageInput<TState> {
  readonly context: LatticeContext;
  readonly runId: LatticeRunId;
  readonly trace: BrandedTraceId;
  readonly payload: TState;
}

export interface StageDefinition<TState = unknown, TKind extends StageKind = StageKind> {
  readonly stage: TKind;
  readonly name: string;
  readonly pluginId?: string;
  readonly runId: LatticeRunId;
  readonly transform: (input: StageInput<TState>) => Promise<TState>;
}

export interface StageTrace {
  readonly stage: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface PlanArtifact<TState = unknown> {
  readonly planId: string;
  readonly state: StageState;
  readonly stages: readonly StageDefinition<TState, StageKind>[];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly finalResult?: TState;
  readonly traces: readonly StageTrace[];
}

export type PlanInputStages = readonly StageDefinition<unknown, StageKind>[];

export type StageInputChain<T extends PlanInputStages> =
  T extends readonly [infer H extends StageDefinition<infer I, any>, ...infer _]
    ? I
    : never;

export type StageOutputChain<T extends PlanInputStages> =
  T extends readonly [...infer _, infer L extends StageDefinition<infer O, any>]
    ? O
    : never;

const startPlanRunId = (tenantId: string): LatticeRunId => {
  return withBrand(`run:${tenantId}:${Date.now().toString(36)}`, 'lattice-run:id') as LatticeRunId;
};

export const createPlanContext = (tenantId: LatticeTenantId): LatticeContext => ({
  tenantId,
  regionId: `region:${tenantId}` as LatticeContext['regionId'],
  zoneId: `zone:${tenantId}` as LatticeContext['zoneId'],
  requestId: withBrand(`trace:${tenantId}:${Date.now().toString(36)}`, 'lattice-trace-id'),
});

export const runPlan = async <
  TContext extends Record<string, unknown>,
  TStages extends readonly StageDefinition<TContext, StageKind>[],
>(
  tenantId: LatticeTenantId,
  stages: NoInfer<TStages>,
  input: TContext,
): Promise<PlanArtifact<TContext>> => {
  const runId = startPlanRunId(`${tenantId}`);
  const context = createPlanContext(tenantId);
  const traces: StageTrace[] = [];
  let payload: TContext = input;

  for (const stage of stages) {
    const startedAt = new Date().toISOString();
    const stageInput: StageInput<TContext> = {
      context,
      runId,
      trace: withBrand(`${runId}:${stage.stage}`, 'lattice-trace-id'),
      payload,
    };

    try {
      payload = await stage.transform(stageInput);
      traces.push({
        stage: stage.name,
        startedAt,
        endedAt: new Date().toISOString(),
        success: true,
      });
    } catch (error) {
      traces.push({
        stage: stage.name,
        startedAt,
        endedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        planId: `plan:${runId}`,
        state: 'failed',
        stages,
        startedAt,
        endedAt: new Date().toISOString(),
        traces,
      };
    }
  }

  return {
    planId: `plan:${runId}`,
    state: 'succeeded',
    stages,
    startedAt: traces[0]?.startedAt ?? new Date().toISOString(),
    endedAt: new Date().toISOString(),
    finalResult: payload,
    traces,
  };
};

export const buildPlanSignature = <TStages extends readonly StageDefinition[]>(
  stages: NoInfer<TStages>,
): `${TStages[number]['name']}::${number}` => {
  return `${stages.map((stage) => stage.name).join('>')}::${stages.length}` as `${TStages[number]['name']}::${number}`;
};

export type PlanByKind<T extends PlanInputStages> = {
  [K in T[number] as K['stage']]: Extract<T[number], { stage: K['stage'] }>;
};

export type StagePluginMap<T extends PlanInputStages> = {
  [P in T[number] as P['stage']]: readonly PluginByKind<readonly PluginEnvelope<unknown, unknown, PluginKind>[], 'transform'>[];
};

export interface PlanRuntime<TState = unknown> {
  readonly id: string;
  readonly signature: string;
  readonly traces: readonly StageTrace[];
  readonly context: { tenantId: LatticeTenantId };
  readonly plugin: PluginKind;
  readonly state: TState;
}

export const buildPlanRuntime = <TState>(
  tenant: LatticeTenantId,
  stages: readonly StageDefinition<any, StageKind>[],
  initial: TState,
): PlanRuntime<TState> => {
  return {
    id: `runtime:${tenant}:${Date.now().toString(36)}`,
    signature: buildPlanSignature(stages as readonly StageDefinition<unknown, StageKind>[]),
    traces: [],
    context: { tenantId: tenant },
    plugin: 'transform',
    state: initial,
  };
};
