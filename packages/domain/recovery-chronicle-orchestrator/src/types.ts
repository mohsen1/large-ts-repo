import { z } from 'zod';
import type { Brand, DeepReadonly, Merge, NoInfer, NonEmptyArray, RecursivePath } from '@shared/type-level';
import {
  axisWeights,
  asChronicleChannel,
  asChronicleTag,
  asChroniclePlanId,
  asChronicleRoute,
  asChronicleRunId,
  asChronicleTenantId,
} from '@domain/recovery-chronicle-core';
import type {
  ChronicleAxisWeights,
  ChronicleBlueprint,
  ChronicleChannel,
  ChroniclePlanId,
  ChronicleRoute,
  ChronicleRunId,
  ChronicleTenantId,
  ChroniclePriority,
} from '@domain/recovery-chronicle-core';

export type OrchestrationMode = 'strict' | 'adaptive' | 'simulated';
export type OrchestrationStage = 'bootstrap' | 'policy' | 'telemetry' | 'finalize';
export type OrchestrationSignalChannel = 'signal' | 'policy' | 'telemetry' | 'incident';

export type OrchestrationId = Brand<string, 'ChronicleOrchestrationId'>;
export type OrchestrationPolicyId = Brand<string, 'ChronicleOrchestrationPolicyId'>;
export type OrchestrationRunId = Brand<string, 'ChronicleOrchestrationRunId'>;
export type OrchestrationWorkspaceId = Brand<string, 'ChronicleOrchestrationWorkspaceId'>;

type StageInputByName = {
  bootstrap: { readonly source: OrchestrationSignalChannel; readonly tenant: ChronicleTenantId; readonly warmupMs: number };
  policy: {
    readonly policyId: OrchestrationPolicyId;
    readonly threshold: number;
    readonly constraints: readonly ChroniclePriority[];
  };
  telemetry: { readonly samples: readonly number[]; readonly includeHistory: boolean };
  finalize: { readonly finalizedBy: string; readonly reason?: string };
};

type StageOutputByName = {
  bootstrap: { readonly readiness: number; readonly planId: ChroniclePlanId };
  policy: { readonly allowed: boolean; readonly score: number; readonly tags: readonly ChroniclePriority[] };
  telemetry: { readonly events: readonly string[]; readonly emitted: number; readonly quality: number };
  finalize: { readonly finalized: boolean; readonly summary: string; readonly confidence: number };
};

export type OrchestrationStageInput<T extends OrchestrationStage = OrchestrationStage> = {
  readonly stage: T;
  readonly route: `orchestrator:///${T}`;
  readonly payload: StageInputByName[T];
};

export type OrchestrationStageOutput<T extends OrchestrationStage = OrchestrationStage> = StageOutputByName[T];

export interface OrchestrationStageDescriptor<
  TStage extends OrchestrationStage = OrchestrationStage,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly stage: TStage;
  readonly supports: readonly ChronicleChannel<TStage>[];
  readonly id: OrchestrationId;
  readonly version: `${number}.${number}.${number}`;
  readonly mode: OrchestrationMode;
  readonly weight: number;
  readonly execute: (
    input: Merge<OrchestrationStageInput<TStage>, TInput>,
  ) => Promise<{
    readonly output: TOutput;
    readonly trace: OrchestrationTrace;
    readonly status: 'ok' | 'warn' | 'error';
    readonly latencyMs: number;
  }>;
}

type DescriptorOutputTuple<T extends readonly OrchestrationStageDescriptor[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends OrchestrationStageDescriptor<infer TStage, any, infer TOutput>
    ? readonly [
        {
          stage: TStage;
          output: TOutput;
        },
        ...DescriptorOutputTuple<Extract<Tail, readonly OrchestrationStageDescriptor[]>>,
      ]
    : readonly []
  : readonly [];

export type StageOutputUnion<TPlugins extends readonly OrchestrationStageDescriptor[]> = Readonly<DescriptorOutputTuple<TPlugins>>;

export interface OrchestrationPolicy {
  readonly id: OrchestrationPolicyId;
  readonly tenant: ChronicleTenantId;
  readonly mode: OrchestrationMode;
  readonly stages: NonEmptyArray<OrchestrationStage>;
  readonly maxParallelism: number;
  readonly minConfidence: number;
  readonly allowedTiers: readonly ChroniclePriority[];
}

export interface OrchestrationTrace {
  readonly id: OrchestrationRunId;
  readonly session: OrchestrationId;
  readonly startedAt: number;
  readonly stageOrder: readonly OrchestrationStage[];
}

export interface OrchestrationRunContext {
  readonly runId: OrchestrationRunId;
  readonly tenant: ChronicleTenantId;
  readonly policyId: OrchestrationPolicyId;
  readonly channels: readonly OrchestrationSignalChannel[];
  readonly profile: {
    readonly namespace: ChronicleRoute;
    readonly allowParallel: boolean;
    readonly maxQueue: number;
    readonly includeTelemetry: boolean;
  };
  readonly startedAt: number;
}

export interface OrchestratedStepResult<T extends OrchestrationStage = OrchestrationStage> {
  readonly stage: T;
  readonly status: 'ok' | 'warn' | 'error';
  readonly output: OrchestrationStageOutput<T>;
  readonly score: number;
  readonly latencyMs: number;
}

export interface OrchestratedRun<TBlueprint extends ChronicleBlueprint = ChronicleBlueprint> {
  readonly runId: OrchestrationRunId;
  readonly context: OrchestrationRunContext;
  readonly blueprint: TBlueprint;
  readonly scenario: {
    readonly id: ChroniclePlanId;
    readonly route: ChronicleRoute;
    readonly tenant: ChronicleTenantId;
  };
  readonly output: DeepReadonly<readonly OrchestratedStepResult[]>;
  readonly durationMs: number;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed';
}

export interface OrchestrationDiagnostic {
  readonly runId: OrchestrationRunId;
  readonly key: `diag.${'critical' | 'warning' | 'ok' | 'error'}`;
  readonly score: number;
  readonly message: string;
}

export interface OrchestrationWorkspace {
  readonly workspaceId: OrchestrationWorkspaceId;
  readonly tenant: ChronicleTenantId;
  readonly policy: OrchestrationPolicy;
  readonly stages: readonly OrchestrationStageDescriptor[];
}

export interface OrchestrateRequest {
  readonly tenant: string;
  readonly planId: string;
  readonly policy?: OrchestrationPolicy;
  readonly mode?: OrchestrationMode;
}

export type StageTuplePrefix<TValue, TTuple extends readonly unknown[]> = TTuple extends readonly [...infer Rest]
  ? readonly [TValue, ...Rest]
  : readonly [TValue];

export type StageTupleSuffix<TTuple extends readonly unknown[], TValue> = TTuple extends readonly [...infer Rest]
  ? readonly [...Rest, TValue]
  : readonly [TValue];

export type WorkspaceState<T> = { readonly [K in keyof T]: T[K] };

export type RemappedNodeMap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `__${string}` ? never : `stage.${Extract<K, string>}`]: T[K];
};

export type RecursiveStagePaths<T extends readonly OrchestrationStage[]> =
  T extends readonly []
    ? readonly []
    : T extends readonly [infer Head, ...infer Tail]
      ? Head extends OrchestrationStage
        ? readonly [`${Head}.${number}`, ...RecursiveStagePaths<Extract<Tail, readonly OrchestrationStage[]>>]
        : readonly []
      : readonly [];

export const axisWeightDefaults: ChronicleAxisWeights = {
  ...axisWeights,
  'axis.throughput': 1,
  'axis.resilience': 0.9,
  'axis.observability': 0.8,
  'axis.compliance': 0.7,
  'axis.cost': 0.2,
  'axis.operational': 0.6,
} satisfies ChronicleAxisWeights;

const policySchema = z.object({
  tenant: z.string(),
  mode: z.enum(['strict', 'adaptive', 'simulated']),
  stages: z.array(z.enum(['bootstrap', 'policy', 'telemetry', 'finalize'])).min(1),
  maxParallelism: z.number().int().min(1).max(64),
  minConfidence: z.number().min(0).max(1),
  allowedTiers: z.array(z.enum(['p0', 'p1', 'p2', 'p3'])),
});

export const buildPolicy = (tenant: ChronicleTenantId, mode: OrchestrationMode): OrchestrationPolicy => ({
  id: `policy:${tenant}:${Date.now()}` as OrchestrationPolicyId,
  tenant,
  mode,
  stages: ['bootstrap', 'policy', 'telemetry', 'finalize'],
  maxParallelism: 4,
  minConfidence: 0.72,
  allowedTiers: ['p0', 'p1'],
});

export const defaultPolicy = (tenant: string): OrchestrationPolicy => buildPolicy(asChronicleTenantId(tenant), 'adaptive');

export const parsePolicy = (raw: unknown): OrchestrationPolicy | undefined => {
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return {
    id: `policy:${parsed.data.tenant}:${Date.now()}` as OrchestrationPolicyId,
    tenant: asChronicleTenantId(parsed.data.tenant),
    mode: parsed.data.mode,
    stages: parsed.data.stages as NonEmptyArray<OrchestrationStage>,
    maxParallelism: parsed.data.maxParallelism,
    minConfidence: parsed.data.minConfidence,
    allowedTiers: parsed.data.allowedTiers,
  };
};

export const buildRunId = (tenant: ChronicleTenantId, route: ChronicleRoute): OrchestrationRunId =>
  (asChronicleRunId(asChroniclePlanId(tenant, route)) as unknown) as OrchestrationRunId;

export const buildRuntimeId = (prefix: string, index: number): OrchestrationId =>
  `${prefix}:${index}` as OrchestrationId;

export const buildWorkspaceId = (tenant: ChronicleTenantId): OrchestrationWorkspaceId =>
  `workspace:${tenant}` as OrchestrationWorkspaceId;

export const inferPlanStages = <TContext extends { readonly stages?: readonly OrchestrationStage[] }>(
  context: NoInfer<TContext>,
): NonEmptyArray<OrchestrationStage> => {
  const fallback: NonEmptyArray<OrchestrationStage> = ['bootstrap', 'policy', 'telemetry', 'finalize'];
  return (context.stages?.length ? context.stages : fallback) as NonEmptyArray<OrchestrationStage>;
};

export const mapStagePaths = <TBlueprint extends Record<string, unknown>>(blueprint: TBlueprint): RecursivePath<TBlueprint>[] =>
  Object.keys(blueprint as Record<string, unknown>).map((key) => asChronicleTag(key) as RecursivePath<TBlueprint>);

export const makeDescriptorLabel = <TStage extends OrchestrationStage>(stage: TStage): ChronicleChannel<TStage> =>
  asChronicleChannel(stage);

export const buildTrace = (runId: OrchestrationRunId, stageOrder: readonly OrchestrationStage[]): OrchestrationTrace => ({
  id: runId,
  session: buildRuntimeId('trace', stageOrder.length),
  startedAt: Date.now(),
  stageOrder,
});

export const buildAxisWeights = (): ChronicleAxisWeights => ({ ...axisWeights, ...axisWeightDefaults } satisfies ChronicleAxisWeights);
