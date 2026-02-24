import type { Brand, ReadonlyDeep } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export const strategyModes = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'] as const;
export const strategyLanes = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;
export const signalSources = ['telemetry', 'intent', 'policy', 'orchestration', 'manual'] as const;
export const severityBands = ['info', 'warn', 'error', 'critical', 'fatal'] as const;

export type StrategyMode = (typeof strategyModes)[number];
export type StrategyLane = (typeof strategyLanes)[number];
export type SignalSource = (typeof signalSources)[number];
export type SeverityBand = (typeof severityBands)[number];

export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RunId = Brand<string, 'RunId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type PluginId = Brand<string, 'PluginId'>;
export type PluginFingerprint = Brand<string, 'PluginFingerprint'>;

export type NamespaceOf<
  TScope extends string,
  TResource extends string,
> = `${TScope}::${TResource}`;

export type SessionRoute<TMode extends StrategyMode = StrategyMode> = `${TMode}/${string}`;
export type LaneRoute<TLane extends StrategyLane = StrategyLane> = `lane:${TLane}`;
export type BrandedPath<TScope extends string, TKind extends string> = `${TScope}#${TKind}:${string}`;

export type StrategyTuple = readonly [StrategyMode, StrategyLane, string, number];
export type StrategyTupleHead<T extends readonly unknown[]> = T extends readonly [infer Head, ...unknown[]] ? Head : never;
export type StrategyTupleTail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : readonly [];

export type BuildStrategyTuple<
  T extends readonly StrategyTuple[],
> = T extends readonly [infer H extends StrategyTuple, ...infer Rest extends readonly StrategyTuple[]]
  ? readonly [H, ...BuildStrategyTuple<Rest>]
  : readonly [];

export type DeepStringMap<T> = T extends string
  ? T
  : T extends Array<infer Item>
    ? readonly DeepStringMap<Item>[]
    : T extends Record<string, unknown>
      ? {
          [K in keyof T as K extends `debug${string}` ? never : K]: DeepStringMap<T[K]>;
        } & { readonly __schema: NamespaceOf<'recovery-lab-intelligence-core', string> }
      : T;

export type RecursivePick<
  T,
  TKeys extends readonly (keyof T & string)[],
> = TKeys extends readonly [infer Head extends keyof T & string, ...infer Tail extends readonly (keyof T & string)[]]
  ? Head extends keyof T
    ? { [K in Head]: T[K] } & RecursivePick<T, Tail>
    : {}
  : {};

export type ValueOf<T> = T[keyof T];
export type MapBy<TRecord extends Record<PropertyKey, unknown>> = {
  [K in keyof TRecord as `${Extract<K, string>}__value`]: TRecord[K];
};
export type MergeWithFallback<Base, Patch> = Omit<Base, keyof Patch> & Patch & Readonly<Record<string, unknown>>;

export type FlattenTuple<
  T extends readonly unknown[],
> = T extends readonly [infer H, ...infer Rest]
  ? H extends readonly unknown[]
    ? [...FlattenTuple<H>, ...FlattenTuple<Rest>]
    : [H, ...FlattenTuple<Rest>]
  : [];

export type UnwrapTuple<T> = T extends readonly [infer A, ...infer B]
  ? readonly [A, ...B]
  : readonly [];

export type VariadicChain<
  T extends readonly unknown[],
  Seed,
  R = Seed,
> = T extends readonly [infer Head, ...infer Tail]
  ? VariadicChain<Tail, R, (Head extends (arg: infer Input, next: any) => infer Output ? Output : R)>
  : R;

export type StageTemplate<
  TLane extends StrategyLane,
  TScope extends string,
> = `${TLane}:${TScope}:${number}`;

export type PlanMetadata<TLane extends StrategyLane = StrategyLane> = {
  readonly lane: TLane;
  readonly route: LaneRoute<TLane>;
  readonly severity: SeverityBand;
  readonly labels: readonly string[];
};

export type StepMeta = ReadonlyDeep<{
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly source: SignalSource;
  readonly confidence: number;
  readonly tags: readonly string[];
}>;

export interface StrategyPhase<TPayload = unknown> {
  readonly phase: StrategyMode;
  readonly lane: StrategyLane;
  readonly scenario: ScenarioId;
  readonly runId: RunId;
  readonly workspace: WorkspaceId;
  readonly mode: StrategyMode;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly payload: TPayload;
}

export interface SignalEvent<TPayload = unknown> {
  readonly source: SignalSource;
  readonly severity: SeverityBand;
  readonly at: string;
  readonly detail: TPayload;
}

export interface StrategyPlan<TPayload = unknown> {
  readonly planId: PlanId;
  readonly sessionId: SessionId;
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly title: string;
  readonly lanes: readonly StrategyLane[];
  readonly steps: readonly StrategyStep<TPayload>[];
  readonly metadata: DeepStringMap<Readonly<Record<string, unknown>>>;
}

export interface StrategyStep<TPayload = unknown> {
  readonly stepId: PluginId;
  readonly index: number;
  readonly plugin: PluginId;
  readonly lane: StrategyLane;
  readonly mode: StrategyMode;
  readonly inputs: ReadonlyDeep<TPayload>;
  readonly output: ReadonlyDeep<TPayload>;
  readonly trace: ReadonlyDeep<{
    readonly route: SessionRoute<StrategyMode>;
    readonly attempts: number;
    readonly fingerprint: PluginFingerprint;
  }>;
}

export interface StrategyResult<TPayload = unknown> {
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly mode: StrategyMode;
  readonly scenario: ScenarioId;
  readonly score: number;
  readonly output: ReadonlyDeep<TPayload>;
  readonly warnings: readonly SignalEvent[];
  readonly events: readonly SignalEvent[];
}

export interface StrategyContext<TContext = unknown> {
  readonly sessionId: SessionId;
  readonly workspace: WorkspaceId;
  readonly runId: RunId;
  readonly planId: PlanId;
  readonly scenario: ScenarioId;
  readonly plugin: PluginId;
  readonly phase: StrategyPhase<TContext>;
  readonly baggage: Readonly<Record<string, unknown>>;
}

export interface ScenarioIntent<TTag extends string = string> {
  readonly intentId: Brand<string, `intent:${TTag}`>;
  readonly intentName: string;
  readonly target: TTag;
  readonly requestedAt: string;
}

export const workspacePathFor = (workspaceId: WorkspaceId, planId: PlanId): BrandedPath<'workspace', string> =>
  `${workspaceId}/workspace#${planId}` as BrandedPath<'workspace', string>;

export const laneRouteFor = <TLane extends StrategyLane>(lane: TLane): LaneRoute<TLane> =>
  `lane:${lane}` as LaneRoute<TLane>;

export const phaseRouteFor = <TMode extends StrategyMode>(mode: TMode): SessionRoute<TMode> =>
  `${mode}/${Math.abs(mode.length)}` as SessionRoute<TMode>;

export const withNoInfer = <TValue, TConstraint>(value: NoInfer<TValue & TConstraint>): TValue => value;

export const asWorkspaceId = (value: string): WorkspaceId => value as WorkspaceId;
export const asSessionId = (value: string): SessionId => value as SessionId;
export const asRunId = (value: string): RunId => value as RunId;
export const asPlanId = (value: string): PlanId => value as PlanId;
export const asScenarioId = (value: string): ScenarioId => value as ScenarioId;
export const asPluginId = (value: string): PluginId => value as PluginId;
export const asPluginFingerprint = (value: string): PluginFingerprint => value as PluginFingerprint;

export const assertSeverity = (value: string): value is SeverityBand =>
  (severityBands as readonly string[]).includes(value);

export const normalizeConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

export const summarizePlan = (plan: StrategyPlan): string => {
  const byLane = plan.steps.reduce<Record<StrategyLane, number>>(
    (acc, step) => ({
      ...acc,
      [step.lane]: (acc[step.lane] ?? 0) + 1,
    }),
    {
      forecast: 0,
      resilience: 0,
      containment: 0,
      recovery: 0,
      assurance: 0,
    },
  );

  return `${plan.title} (${plan.lanes.join(',')}) steps=${plan.steps.length} forecast=${byLane.forecast} recovery=${byLane.recovery} score=${Math.round(
    byLane.containment + byLane.assurance,
  )}`;
};
