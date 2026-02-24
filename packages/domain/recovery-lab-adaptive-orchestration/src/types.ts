import type { Brand } from '@shared/core';
import type { Cursor, NonEmptyArray } from '@shared/type-level';

export const automationStages = ['ingest', 'plan', 'execute', 'verify', 'synthesize'] as const;
export const automationRunModes = ['simulate', 'validate', 'execute', 'dry-run', 'shadow'] as const;
export const adapterKinds = ['in-memory', 'stream', 's3', 'api-gateway', 'policy-store'] as const;

export type AutomationStage = (typeof automationStages)[number];
export type AutomationRunMode = (typeof automationRunModes)[number];
export type CampaignRunMode = AutomationRunMode;
export type AdapterKind = (typeof adapterKinds)[number];

export type TenantId = Brand<string, 'TenantId'>;
export type CampaignId = Brand<string, 'CampaignId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type CampaignStepId = Brand<string, 'CampaignStepId'>;
export type RunId = Brand<string, 'CampaignRunId'>;
export type PluginId = Brand<string, 'PluginId'>;
export type PluginExecutionId = Brand<string, 'PluginExecutionId'>;
export type DiagnosticsPluginId = Brand<string, 'DiagnosticsPluginId'>;
export type DiagnosticsRunId = Brand<string, 'DiagnosticsRunId'>;
export type CheckpointId = Brand<string, 'CheckpointId'>;

export type TenantNamespace<T extends string = string> = `${T}::tenant`;
export type CampaignNamespace = `${CampaignId}:${PlanId}`;
export type StagePath<T extends AutomationStage = AutomationStage> = `${T}/${string}`;
export type PluginRoute<TTenant extends TenantId = TenantId> = `tenant:${TTenant}`;

export type BrandInput<T extends string> = Brand<string, `campaign:${T}`>;
export type ScenarioIntent<TTag extends string = 'default'> = BrandInput<TTag>;

export const asBrand = <TTag extends string>(value: string): Brand<string, TTag> => value as Brand<string, TTag>;
export const asTenantId = (value: string): TenantId => asBrand<'TenantId'>(value);
export const asCampaignId = (value: string): CampaignId => asBrand<'CampaignId'>(value);
export const asPlanId = (value: string): PlanId => asBrand<'PlanId'>(value);
export const asRunId = (value: string): RunId => asBrand<'CampaignRunId'>(value);
export const asPluginExecutionId = (value: string): PluginExecutionId => asBrand<'PluginExecutionId'>(value);
export const asDiagnosticsPluginId = (value: string): DiagnosticsPluginId => asBrand<'DiagnosticsPluginId'>(value);
export const asCampaignStepId = (value: string): CampaignStepId => asBrand<'CampaignStepId'>(value);
export const asCampaignDependency = (value: string): BrandInput<string> => asBrand<`campaign:${string}`>(value);
export const asScenarioIntent = <TTag extends string>(value: TTag): ScenarioIntent<TTag> => asBrand<`campaign:${TTag}`>(value);
export const asCheckpointId = (value: string): CheckpointId => asBrand<'CheckpointId'>(value);

export interface CampaignSignal<TValue extends string | number | boolean = number> {
  readonly name: string;
  readonly unit: string;
  readonly source: string;
  readonly value: TValue;
  readonly at: string;
  readonly dimensions: Readonly<Record<string, string>>;
}

export interface CampaignConstraint {
  readonly key: string;
  readonly operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains';
  readonly threshold: number;
  readonly severity: number;
}

export interface CampaignStep<TPayload = unknown> {
  readonly stepId: CampaignStepId;
  readonly intent: ScenarioIntent<string>;
  readonly action: string;
  readonly expectedDurationMinutes: number;
  readonly constraints: readonly CampaignConstraint[];
  readonly dependencies: readonly BrandInput<string>[];
  readonly payload: TPayload;
  readonly tags: readonly string[];
}

export interface CampaignPlan<TPayload = unknown> {
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly planId: PlanId;
  readonly title: string;
  readonly createdBy: string;
  readonly mode: AutomationRunMode;
  readonly steps: readonly CampaignStep<TPayload>[];
  readonly riskProfile: number;
  readonly signalPolicy: readonly string[];
}

export interface CampaignRunResult<TPayload = unknown> {
  readonly runId: RunId;
  readonly campaignId: CampaignId;
  readonly stage: AutomationStage;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly ok: boolean;
  readonly output: TPayload;
  readonly diagnostics: readonly CampaignDiagnostic[];
}

export interface CampaignDiagnostic {
  readonly id: PluginExecutionId;
  readonly phase: AutomationStage;
  readonly pluginId: Brand<string, 'DiagnosticsPluginId'>;
  readonly at: string;
  readonly source: string;
  readonly message: string;
  readonly tags: readonly string[];
}

export interface CampaignEnvelope<TPayload = unknown, TContext = Record<string, unknown>> {
  readonly runId: RunId;
  readonly campaignId: CampaignId;
  readonly planId: PlanId;
  readonly tenantId: TenantId;
  readonly mode: AutomationRunMode;
  readonly context: TContext;
  readonly payload: TPayload;
}

export interface CampaignSnapshot<TPayload = unknown> {
  readonly key: CheckpointId;
  readonly at: string;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly planId: PlanId;
  readonly stage: AutomationStage;
  readonly payload: TPayload;
}

export type StageIndex<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${StageIndex<Extract<Tail, readonly string[]>>}`
  : '';

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];

export type TupleTail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Tail]
  ? Tail
  : readonly [];

export type TupleHead<T extends readonly unknown[]> = T extends readonly [infer Head, ...unknown[]] ? Head : never;

export type Cartesian<TA extends readonly unknown[], TB extends readonly unknown[]> = TA extends readonly [infer A, ...infer AR]
  ? TB extends readonly [infer B, ...infer BR]
    ? readonly [A, B, ...Cartesian<TupleTail<TA>, TupleTail<TB>>]
    : readonly [A]
  : readonly [];

export type ReverseTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [...ReverseTuple<Tail>, Head]
  : readonly [];

export type CursorLike<T> = Cursor<T> & {
  readonly remaining: readonly T[];
};

export type RecursiveReadonly<T> = T extends readonly unknown[]
  ? readonly RecursiveReadonly<T[number]>[]
  : T extends object
    ? { readonly [K in keyof T]: RecursiveReadonly<T[K]> }
    : T;

export type ConditionalFields<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `debug${string}` ? never : K]: T[K] extends NonEmptyArray<infer U>
    ? RecursiveReadonly<U[]>
    : T[K] extends object
      ? RecursiveReadonly<T[K]>
      : T[K];
};

export const isCampaignPlan = (value: unknown): value is CampaignPlan => {
  return typeof value === 'object' && value !== null && 'campaignId' in value && 'planId' in value;
};

export const campaignSignalToPath = <TKey extends string>(tenantId: TenantId, key: TKey): StagePath<AutomationStage> & `${TenantId}:${TKey}` => {
  return `simulate/${tenantId}:${key}` as StagePath<AutomationStage> & `${TenantId}:${TKey}`;
};
