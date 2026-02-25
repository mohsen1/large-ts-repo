import { Brand, withBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export const PHASE_SEQUENCE = ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'] as const;
export type ExperimentPhase = (typeof PHASE_SEQUENCE)[number];

export type ExperimentPlanVersion = Brand<string, 'ExperimentPlanVersion'>;
export type TenantId = Brand<string, 'TenantId'>;
export type ExperimentId = Brand<string, 'ExperimentId'>;
export type ExperimentRunId = Brand<string, 'ExperimentRunId'>;
export type ExperimentPlanId = Brand<string, 'ExperimentPlanId'>;
export type ExperimentRecordId = Brand<string, 'ExperimentRecordId'>;
export type ExperimentSeed = Brand<string, 'ExperimentSeed'>;
export type ExperimentNodeId = Brand<string, 'ExperimentNodeId'>;
export type ExperimentTag<T extends string = string> = Brand<T, 'ExperimentTag'>;

export type TenantNamespace<T extends string = string> = `autonomy:${T}`;
export type SignalChannel<T extends string = string> = `${T}:signal`;
export type PhaseTuple = readonly ExperimentPhase[];

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];

export type VariadicConcat<T extends readonly unknown[], U extends readonly unknown[]> = readonly [...T, ...U];

export type NoInferTuple<T extends readonly unknown[]> = { readonly [K in keyof T]: NoInfer<T[K]> };

export interface ExperimentContext {
  readonly issuer: Brand<string, 'ExperimentIssuer'>;
  readonly tenantId: TenantId;
  readonly tenantLabel: string;
  readonly namespace: TenantNamespace;
  readonly activePhases: readonly ExperimentPhase[];
  readonly signal: SignalChannel;
}

export interface ExperimentNode<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly nodeId: ExperimentNodeId;
  readonly name: string;
  readonly phase: ExperimentPhase;
  readonly dependencies: readonly ExperimentNodeId[];
  readonly score: number;
  readonly metadata: TMetadata;
}

export interface ExperimentDraftNode<TMetadata extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<ExperimentNode<TMetadata>, 'nodeId'> {
  readonly nodeId?: string;
}

export interface ExperimentIntent {
  readonly experimentId: ExperimentId;
  readonly runId: ExperimentRunId;
  readonly phase: ExperimentPhase;
  readonly seed: ExperimentSeed;
  readonly tags: readonly ExperimentTag[];
  readonly source: `pilot-${ExperimentPhase}`;
  readonly owner: string;
  readonly tenantId: TenantId;
  readonly createdAt: string;
}

export interface ExperimentPayload<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly strategy: string;
  readonly horizonMinutes: number;
  readonly metadata: TMetadata;
  readonly channels: readonly SignalChannel[];
}

export interface ExperimentPlan<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly planId: ExperimentPlanId;
  readonly tenant: TenantId;
  readonly sequence: readonly ExperimentPhase[];
  readonly graph: readonly ExperimentNode<TMetadata>[];
  readonly payload: ExperimentPayload<TMetadata>;
  readonly createdAt: string;
  readonly createdBy: TenantId;
  readonly signature: string;
  readonly version: ExperimentPlanVersion;
}

export interface PlanDraft<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly draftId: Brand<string, 'PlanDraftId'>;
  readonly tenant: TenantId;
  readonly namespace: TenantNamespace;
  readonly candidateNodes: readonly ExperimentDraftNode<TMetadata>[];
  readonly targetPhases: readonly ExperimentPhase[];
  readonly createdAt: string;
}

export interface PlanInput<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly context: ExperimentContext;
  readonly draft: PlanDraft<TMetadata>;
}

export interface PlanBuildOptions {
  readonly tenantAlias: string;
  readonly maxDepth: number;
  readonly diagnostics?: boolean;
}

export interface PlanBuildBundle<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly plan: ExperimentPlan<TMetadata>;
  readonly diagnostics: readonly string[];
  readonly draftSignature: string;
  readonly manifest: {
    readonly nodes: number;
    readonly phases: number;
    readonly signature: string;
  };
}

export interface RuntimeEnvelope<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly plan: ExperimentPlan<TMetadata>;
  readonly intent: ExperimentIntent;
  readonly context: ExperimentContext;
  readonly payload: ExperimentPayload<TMetadata>;
}

export interface RuntimeEvent<TPayload = unknown> {
  readonly phase: ExperimentPhase;
  readonly output: TPayload;
  readonly recordedAt: string;
  readonly runId: ExperimentRunId;
}

export interface RuntimeResult<TPayload = unknown> {
  readonly runId: ExperimentRunId;
  readonly outputs: readonly RuntimeEvent<TPayload>[];
  readonly state: {
    readonly phase: ExperimentPhase;
    readonly sequenceProgress: readonly number[];
    readonly complete: boolean;
  };
}

export interface RuntimeHandle {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export const isExperimentPhase = (value: string): value is ExperimentPhase =>
  (PHASE_SEQUENCE as readonly string[]).includes(value);

export const makeTenantId = (tenant: string): TenantId => withBrand(`tenant:${tenant}`, 'TenantId');
export const makeExperimentId = (tenant: TenantId, seed: string): ExperimentId =>
  withBrand(`${tenant}:experiment:${seed}`, 'ExperimentId');
export const makeRunId = (tenant: TenantId, token = 'run'): ExperimentRunId =>
  withBrand(`${tenant}:${token}:${Date.now()}`, 'ExperimentRunId');
export const makePlanId = (tenant: TenantId): ExperimentPlanId => withBrand(`${tenant}:plan:${Date.now()}`, 'ExperimentPlanId');
export const makeRecordId = (runId: ExperimentRunId): ExperimentRecordId => withBrand(`record:${runId}`, 'ExperimentRecordId');
export const makeSeed = (value = 'seed'): ExperimentSeed => withBrand(`seed:${value}`, 'ExperimentSeed');
export const buildNodeId = (tenant: TenantId, name: string): ExperimentNodeId => withBrand(`${tenant}:node:${name}`, 'ExperimentNodeId');

export const makeSignalChannel = (runId: ExperimentRunId): SignalChannel => `${runId}:signal`;

export const makePlanSignature = <T extends readonly ExperimentPhase[]>(sequence: T): string => normalizePlanSequence(sequence).join('|');

export const normalizePlanSequence = <T extends readonly (ExperimentPhase | string)[]>(sequence?: T): readonly ExperimentPhase[] => {
  if (!sequence || sequence.length === 0) {
    return [...PHASE_SEQUENCE];
  }
  const filtered = sequence.filter((value): value is ExperimentPhase => isExperimentPhase(value));
  return filtered.length ? filtered : [...PHASE_SEQUENCE];
};

export const normalizeNodeScore = (score: number): number => {
  if (!Number.isFinite(score)) return 0;
  if (score <= 0) return 0;
  if (score >= 1) return 1;
  return score;
};

export type PhaseEnvelope<T extends PhaseTuple> = {
  [K in T[number] as `step:${K}`]: {
    readonly phase: K;
    readonly rank: number;
  };
};

export const makePhaseEnvelope = <T extends readonly ExperimentPhase[]>(sequence: T): PhaseEnvelope<T> =>
  Object.fromEntries(
    sequence.map((phase, index) => [`step:${phase}`, { phase, rank: index }]),
  ) as unknown as PhaseEnvelope<T>;

export const toPhaseArray = <T extends PhaseTuple>(tuple: T): RecursiveTuple<T> => [...tuple] as unknown as RecursiveTuple<T>;

export const composeNodeChain = <T extends readonly ExperimentNode[]>(nodes: T): T =>
  nodes.map((node) => ({ ...node, score: normalizeNodeScore(node.score) })) as unknown as T;
