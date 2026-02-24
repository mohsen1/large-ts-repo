import {
  Brand,
  normalizeLimit,
  withBrand,
} from '@shared/core';
import { canonicalizeNamespace, type PluginContext, type PluginDefinition, type PluginId, type PluginKind, type PluginNamespace } from '@shared/stress-lab-runtime';
import { buildPluginVersion } from '@shared/stress-lab-runtime';
import {
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySignal,
  type RecoverySimulationResult,
  type TenantId,
  type WorkloadTopology,
  clampConfidence,
} from '@domain/recovery-stress-lab';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type ConvergenceScope = 'tenant' | 'topology' | 'signal' | 'policy' | 'fleet';
export type ConvergenceStage = 'input' | 'resolve' | 'simulate' | 'recommend' | 'report';

export type ConvergencePluginKind<
  TScope extends ConvergenceScope = ConvergenceScope,
  TStage extends ConvergenceStage = ConvergenceStage,
> = `stress-lab/${TScope}/${TStage}`;

export type ConvergenceTraceKey<TScope extends ConvergenceScope> = `${TScope}:trace`;
export type ConvergenceStageLabel<TStage extends ConvergenceStage> = `${TStage}:checkpoint`;
export type ConvergenceOutputValue<TStage extends ConvergenceStage> = `${TStage}-output`;
export type ConvergenceScopeChain<TInput extends ConvergenceScope = ConvergenceScope> = {
  readonly scope: TInput;
  readonly next: readonly ConvergenceScope[];
};

export type ConvergenceConstraintId = Brand<string, 'ConvergenceConstraintId'>;
export type ConvergenceRunId = Brand<string, 'ConvergenceRunId'>;
export type ConvergenceEnvelopeId = Brand<string, 'ConvergenceEnvelopeId'>;
export type ConvergencePluginId = PluginId;
export type ConvergenceNamespace = PluginNamespace;
export type ConvergenceVariant = `convergence:${ConvergenceScope}:${ConvergenceStage}`;

export interface ConvergenceConstraint {
  readonly id: ConvergenceConstraintId;
  readonly scope: ConvergenceScope;
  readonly key: string;
  readonly weight: number;
  readonly active: boolean;
}

export interface ConvergenceContext<TConfig extends Record<string, unknown> = Record<string, unknown>> extends PluginContext<TConfig> {
  readonly runId: ConvergenceRunId;
  readonly scope: ConvergenceScope;
  readonly traceId: string;
  readonly signalCount: number;
}

export interface ConvergenceInput<TStage extends ConvergenceStage = ConvergenceStage> {
  readonly runId: ConvergenceRunId;
  readonly tenantId: TenantId;
  readonly stage: TStage;
  readonly scope: ConvergenceScope;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly anchorConstraints: readonly ConvergenceConstraint[];
  readonly basePlan: OrchestrationPlan | null;
  readonly activeRunbooks: readonly CommandRunbook[];
  readonly baseline: ConvergenceEnvelopeId;
  readonly requestedAt: string;
}

export interface ConvergenceOutput<TStage extends ConvergenceStage = ConvergenceStage> {
  readonly runId: ConvergenceRunId;
  readonly tenantId: TenantId;
  readonly stage: TStage;
  readonly score: number;
  readonly confidence: number;
  readonly diagnostics: readonly string[];
  readonly simulation: RecoverySimulationResult | null;
  readonly selectedRunbooks: readonly CommandRunbook[];
  readonly signalDigest: Readonly<Record<ConvergenceStage, number>>;
}

export interface ConvergenceExecutionOutput extends ConvergenceOutput<'report'> {
  readonly timeline: readonly string[];
  readonly stageTrail: readonly ConvergenceStage[];
}

export type ConvergenceInputForStage<T extends ConvergenceStage> = ConvergenceInput<T>;
export type ConvergencePluginInput<TPlugin> = TPlugin extends ConvergencePlugin<infer TInput, any> ? TInput : never;
export type ConvergencePluginOutput<TPlugin> = TPlugin extends ConvergencePlugin<any, infer TOutput> ? TOutput : never;
export type ConvergencePlugin<TInput extends ConvergenceInput<ConvergenceStage> = ConvergenceInput, TOutput = unknown> = PluginDefinition<
  TInput,
  TOutput,
  Record<string, unknown>,
  PluginKind
>;

export type StageTrail<T extends readonly ConvergenceStage[]> = RecursiveTuple<T>;
export type RemapConstraintMap<T extends Record<string, ConvergenceConstraint>> = {
  [K in keyof T as K extends string ? `${K}:constraint` : never]: T[K]['weight'];
};

export const defaultConvergenceStages = ['input', 'resolve', 'simulate', 'recommend', 'report'] as const;

export type DefaultConvergenceStages = typeof defaultConvergenceStages;

export interface StageMetadata {
  readonly stage: ConvergenceStage;
  readonly weight: number;
  readonly parallelizable: boolean;
}

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...RecursiveTuple<Tail & readonly unknown[]>]
  : readonly [];

export type StageWeight<T extends ConvergenceStage> = T extends 'input'
  ? 1
  : T extends 'resolve'
    ? 3
    : T extends 'simulate'
      ? 5
      : T extends 'recommend'
        ? 2
        : 1;

export type StageWeightMap = {
  [K in ConvergenceStage]: StageWeight<K>;
};

export const stageWeights: StageWeightMap = {
  input: 1,
  resolve: 3,
  simulate: 5,
  recommend: 2,
  report: 1,
};

export const stageProfiles = {
  input: { stage: 'input', weight: stageWeights.input, parallelizable: false },
  resolve: { stage: 'resolve', weight: stageWeights.resolve, parallelizable: true },
  simulate: { stage: 'simulate', weight: stageWeights.simulate, parallelizable: true },
  recommend: { stage: 'recommend', weight: stageWeights.recommend, parallelizable: true },
  report: { stage: 'report', weight: stageWeights.report, parallelizable: false },
} satisfies Record<ConvergenceStage, StageMetadata>;

export const defaultTraceNames: readonly ConvergenceStage[] = defaultConvergenceStages.map((stage) => stage);

export const createConvergenceRunId = (tenantId: TenantId, seed: string): ConvergenceRunId =>
  withBrand(`${tenantId}::${seed}::${Date.now()}`, 'ConvergenceRunId');

export const buildConvergenceRunId = createConvergenceRunId;

export const createConstraintId = (scope: ConvergenceScope, key: string): ConvergenceConstraintId =>
  withBrand(`${scope}:${key}` as string, 'ConvergenceConstraintId');

export const createEnvelopeId = (runId: ConvergenceRunId, stage: ConvergenceStage): ConvergenceEnvelopeId =>
  withBrand(`${runId}:${stage}` as string, 'ConvergenceEnvelopeId');

export const buildEnvelopeId = createEnvelopeId;

export const buildConvergencePluginId = (
  namespace: ConvergenceNamespace,
  scope: ConvergenceScope,
  stage: ConvergenceStage,
  name: string,
): ConvergencePluginId => `${namespace}::${toPluginKind(scope, stage)}::${name}` as ConvergencePluginId;

export const buildConvergencePluginVersion = (): `${number}.${number}.${number}` => buildPluginVersion(1, 0, 0);

export const buildConvergenceNamespace = (): ConvergenceNamespace => canonicalizeNamespace('recovery:lab:orchestration');

export const toPluginKind = <TScope extends ConvergenceScope, TStage extends ConvergenceStage>(
  scope: TScope,
  stage: TStage,
): ConvergencePluginKind<TScope, TStage> => `stress-lab/${scope}/${stage}`;

export const normalizeConstraint = (constraint: ConvergenceConstraint): ConvergenceConstraint => {
  return {
    ...constraint,
    weight: Math.max(0, Math.min(1, normalizeLimit(constraint.weight) / 5000)),
  };
};

export const normalizeConstraints = (
  constraints: readonly ConvergenceConstraint[],
): readonly ConvergenceConstraint[] =>
  [...constraints].map(normalizeConstraint);

export const buildStageTrail = <TStages extends readonly ConvergenceStage[]>(stages: TStages): StageTrail<TStages> => {
  const normalized = [...stages].toSorted();
  return [...normalized] as StageTrail<TStages>;
};

export const toConvergenceOutput = <TStage extends ConvergenceStage>(
  input: ConvergenceInput<TStage>,
  stage: TStage,
  score: number,
  diagnostics: readonly string[],
): ConvergenceOutput<TStage> => {
  return {
    runId: input.runId,
    tenantId: input.tenantId,
    stage,
    score: clampConfidence(score),
    confidence: clampConfidence(score * stageWeights[stage]),
    diagnostics,
    simulation: input.basePlan ? null : null,
    selectedRunbooks: input.activeRunbooks,
    signalDigest: {
      input: diagnostics.length / 10,
      resolve: diagnostics.length / 20,
      simulate: diagnostics.length / 30,
      recommend: diagnostics.length / 40,
      report: diagnostics.length / 50,
    },
  };
};

export const createRunSeed = <TScope extends ConvergenceScope>(scope: TScope, tenantId: TenantId, seed: string): string =>
  [scope, tenantId, seed, Math.floor(Date.now())].join('|');
