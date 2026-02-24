import { Brand } from '@shared/type-level';
import { toTimestamp, type RecoveryPlan, type PlanId, type UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
export type { UtcIsoTimestamp } from '@domain/recovery-cockpit-models';

export type ConstellationId = Brand<string, 'ConstellationId'>;
export type ConstellationRunId = Brand<string, 'ConstellationRunId'>;
export type ConstellationNodeId = Brand<string, 'ConstellationNodeId'>;
export type ConstellationChannelId = Brand<string, 'ConstellationChannelId'>;
export type ConstellationTemplateId = Brand<string, 'ConstellationTemplateId'>;

export type ConstellationScope = 'global' | 'tenant' | 'service' | 'fleet';
export type ConstellationMode = 'analysis' | 'simulation' | 'execution' | 'stabilization';

export const CONstellationStages = [
  'bootstrap',
  'ingest',
  'synthesize',
  'validate',
  'simulate',
  'execute',
  'recover',
  'sweep',
] as const;

export type ConstellationStage = typeof CONstellationStages[number];
export type StageRoute<T extends ConstellationStage> = `stage:${T}:route`;
export type StageTag = `stage:${ConstellationStage}`;
export type ConstellationTopologyProfile = {
  readonly runMode: ConstellationMode;
  readonly stages: readonly ConstellationStage[];
};
export type BrandedTopologyDigest<M extends ConstellationMode = ConstellationMode> = {
  readonly mode: M;
  readonly stages: readonly ConstellationStage[];
  readonly topologyFingerprint: string;
};
export type RunState = 'queued' | 'running' | 'completed' | 'blocked' | 'review';
export type ConstellationMetricKind = `metric:${ConstellationMode}`;

export type StageScoreTuple<T extends ConstellationStage = ConstellationStage> = readonly [
  stage: T,
  score: number,
  at: string,
];

export type RecursiveTuple<N extends number, T extends readonly unknown[] = []> = T['length'] extends N
  ? T
  : RecursiveTuple<N, [...T, ConstellationMetricKind]>;

export type ConstellationMetricWindow = RecursiveTuple<5>;

export interface ConstellationSignalEnvelope {
  readonly signalId: ConstellationTemplateId;
  readonly title: string;
  readonly body: string;
  readonly score: number;
}

export interface ConstellationNode {
  readonly nodeId: ConstellationNodeId;
  readonly label: string;
  readonly stage: ConstellationStage;
  readonly actionCount: number;
  readonly criticality: number;
}

export interface ConstellationTimelineEdge {
  readonly from: ConstellationNodeId;
  readonly to: ConstellationNodeId;
}

export type ConstellationTopology = {
  readonly nodes: readonly ConstellationNode[];
  readonly edges: readonly ConstellationTimelineEdge[];
};

export interface ConstellationRunFingerprint {
  readonly runId: ConstellationRunId;
  readonly planId: PlanId;
  readonly createdAt: string;
  readonly scope: ConstellationScope;
  readonly mode: ConstellationMode;
}

export interface ConstellationPlanEnvelope {
  readonly id: ConstellationTemplateId;
  readonly plan: RecoveryPlan;
  readonly createdAt: string;
  readonly mode: ConstellationMode;
  readonly stages: readonly ConstellationStage[];
}

export const newConstellationId = (value: string): ConstellationId => `constellation:${value}` as ConstellationId;
export const newRunId = (value: string): ConstellationRunId => `run:${value}` as ConstellationRunId;
export const newNodeId = (value: string): ConstellationNodeId => `node:${value}` as ConstellationNodeId;
export const newChannelId = (value: string): ConstellationChannelId => `channel:${value}` as ConstellationChannelId;
export const newTemplateId = (value: string): ConstellationTemplateId => `template:${value}` as ConstellationTemplateId;
export const newTopologyDigest = (mode: ConstellationMode, stages: readonly ConstellationStage[]): BrandedTopologyDigest<ConstellationMode> => ({
  mode,
  stages,
  topologyFingerprint: `${mode}:${stages.join('>')}`,
});

export const buildConstellationTimestamp = (): string => toTimestamp(new Date());
export const buildConstellationTimestampBrand = (): UtcIsoTimestamp => toTimestamp(new Date());

export const stageRoute = <T extends ConstellationStage>(stage: T): StageRoute<T> =>
  `stage:${stage}:route`;

export const isConstellationStage = (value: string): value is ConstellationStage =>
  CONstellationStages.includes(value as ConstellationStage);
