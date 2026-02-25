import type { Brand, Brand as CoreBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  PolicyId,
  CascadeBlueprint,
  CascadePolicyRun,
  CascadePolicyTemplate,
  MetricObservation,
  StageContract,
  StageInputByName,
  StageName,
  StageNameFromManifest,
  TenantIdentity,
} from '@domain/recovery-cascade-intelligence';

export type OrchestratorTenant = TenantIdentity['id'];
export type OrchestratorPolicyId = PolicyId;
export type OrchestratorRunId = Brand<string, 'RunId'>;

export interface StageTimeline<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly stage: StageName;
  readonly durationMs: number;
  readonly status: 'pending' | 'ok' | 'warn' | 'failed';
  readonly output?: unknown;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface PlannerInput<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly tenantId: OrchestratorTenant;
  readonly policyId: OrchestratorPolicyId;
  readonly dryRun: boolean;
}

export interface PlannedRun<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly runId: OrchestratorRunId;
  readonly tenantId: OrchestratorTenant;
  readonly blueprint: TBlueprint;
  readonly template: CascadePolicyTemplate;
  readonly plan: readonly StageTimeline<TBlueprint>[];
  readonly confidence: number;
  readonly metadata: Readonly<{
    readonly stageCount: number;
    readonly dependencyLayers: ReadonlyArray<StageNameFromManifest<TBlueprint>[]>;
  }>;
}

export interface OrchestratorSummary {
  readonly okCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly maxRisk: number;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface OrchestratorResult<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly runId: OrchestratorRunId;
  readonly blueprintName: TBlueprint['namespace'];
  readonly execution: CascadePolicyRun<TBlueprint>;
  readonly timeline: readonly StageTimeline<TBlueprint>[];
  readonly metrics: readonly MetricObservation[];
  readonly summary: OrchestratorSummary;
  readonly insights: string[];
}

export type OrchestratorOptions = Readonly<{
  readonly timeoutMs: number;
  readonly maxAdapters: number;
  readonly runTags: readonly string[];
  readonly enforceOrder: boolean;
  readonly baselineWindowMs: number;
  readonly pluginFilter?: readonly string[];
  readonly useAsyncScope?: boolean;
}>;

export const defaultOrchestratorOptions: OrchestratorOptions = {
  timeoutMs: 8_000,
  maxAdapters: 8,
  runTags: ['default', 'intel'],
  enforceOrder: true,
  baselineWindowMs: 5_000,
  useAsyncScope: true,
};

export interface PlannerInputOptions {
  readonly maxAdapters?: number;
  readonly enforceTopology?: boolean;
  readonly labels?: readonly string[];
}

export interface AdapterInvocation<TInput extends object = object, TOutput extends object = object> {
  readonly input: TInput;
  readonly output?: TOutput;
  readonly startedAt: string;
  readonly elapsedMs: number;
}

export interface ExecutionPlanInput<TBlueprint extends CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly tenantId: OrchestratorTenant;
  readonly dryRun: boolean;
  readonly timeoutMs: number;
}

export interface StageTelemetryPoint {
  readonly stage: StageName;
  readonly metrics: Readonly<Record<string, number | string>>;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface AdapterRegistryEntry<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly id: string;
  readonly apply: (blueprint: NoInfer<TBlueprint>, tenantId: string) => Promise<OrchestratorResult<TBlueprint>>;
  readonly stageContract: StageContract;
}

export type AdapterByKind<T extends readonly AdapterRegistryEntry[]> = {
  [K in T[number]['id']]: Extract<T[number], { id: K }>;
};

export const buildOrchestratorSummary = (input: {
  ok: number;
  warn: number;
  fail: number;
  risk: number;
  startedAt: string;
  completedAt: string;
}): OrchestratorSummary => ({
  okCount: input.ok,
  warnCount: input.warn,
  failCount: input.fail,
  maxRisk: input.risk,
  startedAt: input.startedAt,
  completedAt: input.completedAt,
});

export interface PlanStage<TBlueprint extends CascadeBlueprint> {
  readonly stage: StageNameFromManifest<TBlueprint>;
  readonly index: number;
  readonly estimateMs: number;
  readonly dependencyDepth: number;
  readonly dependencies: readonly string[];
}

export interface StageInputMap<TBlueprint extends CascadeBlueprint> {
  readonly values: {
    [K in StageNameFromManifest<TBlueprint>]: StageInputByName<TBlueprint, K>;
  };
}

export interface TimelineLayer<TBlueprint extends CascadeBlueprint> {
  readonly index: number;
  readonly stage: StageNameFromManifest<TBlueprint>;
  readonly metricCount: number;
}
