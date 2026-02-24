import { horizonBrand } from '@domain/recovery-horizon-engine';
import type {
  PluginStage,
  PluginConfig,
  PluginContract,
  PluginPayload,
  JsonLike,
  HorizonSignal,
  HorizonPlan,
  TimeMs,
  StageSpan,
  PlanId,
  RunId,
} from '@domain/recovery-horizon-engine';
import type { Brand } from '@shared/type-level';

export type NoInfer<T> = [T][T extends T ? 0 : never];

export type StageRoute<T extends string> = `${Uppercase<T>}/${T}`;
export type TimelineLabel<TKind extends PluginStage> = `${Uppercase<TKind>}_STAGE`;
export type WorkspaceId = Brand<string, 'horizon-studio-workspace'>;
export type RunSessionId = Brand<string, 'horizon-studio-run'>;
export type ProfileId = Brand<string, 'horizon-studio-profile'>;

export interface WorkspaceIntent {
  readonly tenantId: string;
  readonly owner: string;
  readonly tags: readonly string[];
  readonly runLabel: string;
  readonly stages: readonly PluginStage[];
}

export interface StageWeight<TKind extends PluginStage> {
  readonly stage: TKind;
  readonly weight: number;
  readonly route: StageRoute<TKind>;
  readonly label: TimelineLabel<TKind>;
}

export interface PluginDescriptor<TKind extends PluginStage, TPayload = PluginPayload> {
  readonly id: Brand<string, `plugin:${TKind}`>;
  readonly stage: TKind;
  readonly name: string;
  readonly contract: PluginContract<TKind, PluginConfig<TKind, TPayload>, TPayload>;
  readonly route: StageRoute<TKind>;
  readonly profile: ProfileId;
}

export interface StageEnvelope<TKind extends PluginStage = PluginStage, TPayload = PluginPayload> {
  readonly stage: TKind;
  readonly runId: RunId;
  readonly startedAt: TimeMs;
  readonly payload: TPayload;
}

export interface StudioWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly profileId: ProfileId;
  readonly sessionId: RunSessionId;
  readonly intent: WorkspaceIntent;
  readonly plans: readonly HorizonPlan[];
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly createdAt: TimeMs;
}

export interface WorkspaceState {
  readonly workspaceId: WorkspaceId;
  readonly selectedPlan?: PlanId;
  readonly active: boolean;
  readonly stageWindow: readonly StageWeight<PluginStage>[];
  readonly sessionAgeMs: TimeMs;
}

export interface WorkspaceServiceFailure {
  readonly ok: false;
  readonly reason: string;
}

export interface WorkspaceServiceResult {
  readonly ok: true;
  readonly state: WorkspaceState;
  readonly workspace: StudioWorkspace;
}

export type ServiceResult = WorkspaceServiceResult | WorkspaceServiceFailure;

export interface SchedulerTask {
  readonly id: Brand<string, 'scheduler-task'>;
  readonly stage: PluginStage;
  readonly order: number;
  readonly startedAt: TimeMs;
  readonly windowWeight: number;
}

export interface StageCursor<T extends readonly PluginStage[]> {
  readonly index: number;
  readonly stage: T[number];
}

export interface SchedulerWindow<TStages extends readonly PluginStage[]> {
  readonly stages: TStages;
  readonly totalWeight: number;
  readonly routeMap: StageRouteByStage<TStages>;
  readonly path: readonly StageCursor<TStages>[];
}

export type PluginByKind<TContracts extends readonly PluginContract<any, any, any>[]> = {
  [K in TContracts[number] as K['kind']]: K;
};

export type StageByKindMatrix<TStages extends readonly PluginStage[], TPayload = PluginPayload> = {
  [K in TStages[number] as StageRoute<K>]: {
    readonly stage: K;
    readonly payloadType: TPayload;
    readonly profile: ProfileId;
  };
};

export type RecursivePlanTuple<T extends readonly unknown[], Acc extends readonly unknown[] = []> =
  T extends readonly [infer Head, ...infer Tail]
    ? RecursivePlanTuple<Tail, [...Acc, [Head]]>
    : Acc;

export type StageTupleWindow<T extends readonly PluginStage[]> = readonly PluginStage[];
export type TailOf<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];
export type ContractKey<T extends PluginContract<any, any, any>> = `${T['kind']}/${T['id']}`;
export type RouteByKind<T extends readonly PluginContract<any, any, any>[]> = {
  [K in T[number] as ContractKey<K>]: K;
};

export type RecursiveTupleIndex<T extends readonly unknown[], N extends number = 0> =
  T extends readonly []
    ? never
    : N extends T['length']
      ? never
      : readonly [{ readonly index: N; readonly entry: T[0] }, ...RecursiveTupleIndex<TailOf<T>, N | (N & number)>];

export const defaultWeights = {
  ingest: 15,
  analyze: 30,
  resolve: 20,
  optimize: 10,
  execute: 25,
} as const satisfies Record<PluginStage, number>;

export type StageRouteByStage<TStages extends readonly PluginStage[]> = Record<StageRoute<PluginStage>, TStages[number]>;

export const routeLabel = <TKind extends PluginStage>(stage: TKind, index: number): StageRoute<TKind> =>
  `${stage.toUpperCase()}/${index}` as StageRoute<TKind>;

export const asWorkspaceId = (value: string): WorkspaceId => value as WorkspaceId;
export const asRunSessionId = (value: string): RunSessionId => value as RunSessionId;
export const asProfileId = (value: string): ProfileId => value as ProfileId;
export const asRunId = (value: string): RunId => horizonBrand.fromRunId(value);
export const asTime = (value: number): TimeMs => horizonBrand.fromTime(value) as TimeMs;
export const asIso = (value: string): TimeMs => horizonBrand.fromDate(value) as unknown as TimeMs;
export const asStageSpan = <TKind extends PluginStage>(
  stage: TKind,
  order = 0,
  now = Date.now(),
): StageSpan<TKind> => ({
  stage,
  label: `${stage.toUpperCase()}_STAGE` as TimelineLabel<TKind>,
  startedAt: asTime(now),
  durationMs: horizonBrand.fromTime(order * 75) as StageSpan<TKind>['durationMs'],
});

export const isReady = (workspace: { readonly plans: readonly HorizonPlan[] }): boolean =>
  workspace.plans.length > 0;

export const normalizeWeights = (stages: readonly PluginStage[]): readonly StageWeight<PluginStage>[] =>
  stages.map((stage) => ({
    stage,
    weight: defaultWeights[stage] ?? 0,
    route: routeLabel(stage, stage.length),
    label: `${stage.toUpperCase()}_STAGE` as TimelineLabel<typeof stage>,
  }));

export const stageWeights = (input: readonly PluginStage[]): StageWeight<PluginStage>[] =>
  input
    .toSorted((left, right) => defaultWeights[right] - defaultWeights[left])
    .map((stage, index) => ({
      stage,
      weight: defaultWeights[stage] + index,
      route: routeLabel(stage, index),
      label: `${stage.toUpperCase()}_STAGE` as TimelineLabel<typeof stage>,
    }));

export const collectPluginKinds = <T extends readonly PluginStage[]>(stages: T): StageTupleWindow<T> =>
  [...stages].toSorted((left, right) => defaultWeights[left] - defaultWeights[right]);

export const mergePlans = (left: readonly HorizonPlan[], right: readonly HorizonPlan[]) =>
  [...left, ...right].toSorted((a, b) => Number(a.startedAt) - Number(b.startedAt));

export type StageTupleFromContract<T extends readonly PluginContract<PluginStage, any, any>[]> = {
  readonly [K in keyof T]:
    T[K] extends PluginContract<PluginStage, PluginConfig<PluginStage, infer P>, infer _P2> ? PluginConfig<PluginStage, P> : never;
};

export type WorkspaceEnvelope<TKind extends PluginStage = PluginStage> = {
  readonly tenantId: string;
  readonly eventRoute: StageRoute<TKind>;
  readonly payload: HorizonSignal<TKind, JsonLike>;
};
