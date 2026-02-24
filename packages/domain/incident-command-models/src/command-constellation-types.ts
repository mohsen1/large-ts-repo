import type { Brand, NonEmptyArray, KeyPaths } from '@shared/type-level';
import type { CommandPlan, CommandId, CommandWindow, RecoveryCommand } from './types';

export type ConstellationPhase = 'scan' | 'plan' | 'simulate' | 'execute' | 'review';
export type ConstellationTenant = Brand<string, 'ConstellationTenant'>;
export type ConstellationRunId = Brand<string, 'ConstellationRunId'>;
export type ConstellationPlanId = Brand<string, 'ConstellationPlanId'>;
export type ConstellationStageId = Brand<string, 'ConstellationStageId'>;
export type ConstellationArtifactId = Brand<string, 'ConstellationArtifactId'>;

const CONSTELLATION_WINDOW_TAG: unique symbol = Symbol('ConstellationWindowRange');

export type ConstellationWindowRange = readonly [start: string, end: string] & {
  readonly [CONSTELLATION_WINDOW_TAG]: void;
};
export type ConstellationRoute = `/${'console' | 'orchestrator'}/${string}`;
export type ConstellationEventName<T extends string = string> = `constellation:event:${T}`;
export type ConstellationPluginEvent = ConstellationEventName<'scan' | 'plan' | 'simulate' | 'execute' | 'review' | 'rollback' | 'alert'>;
export type ConstellationNodeId = Brand<string, 'ConstellationNodeId'>;

export type PathTupleForModel<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? [K, ...PathTupleForModel<T[K]>]
        : [K];
    }[keyof T & string]
  : [];

export type RemapToEventKeys<T> = {
  [K in keyof T & string as `${ConstellationPluginEvent}:${K}`]: T[K];
};

export type DropUndefined<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined>;
};

export type RecursiveTupleLength<T extends readonly unknown[], Acc extends readonly unknown[] = []> = T extends readonly [unknown, ...infer Rest]
  ? RecursiveTupleLength<Rest, [unknown, ...Acc]>
  : Acc['length'];

export type PrefixTuple<
  T extends readonly string[],
  Prefix extends string,
> = { [K in keyof T]: `${Prefix}:${T[K] & string}` };

export type MergeByPhase<T> = {
  [P in ConstellationPhase]: { readonly phase: P; readonly items: readonly T[] };
};

export type ZipTuples<
  Left extends readonly unknown[],
  Right extends readonly unknown[],
  Out extends readonly unknown[] = [],
> = Left extends readonly [infer LHead, ...infer LTail]
  ? Right extends readonly [infer RHead, ...infer RTail]
    ? ZipTuples<LTail, RTail, [...Out, readonly [LHead, RHead]]>
    : Out
  : Out;

export interface ConstellationWindow {
  readonly id: Brand<string, 'ConstellationWindowId'>;
  readonly range: ConstellationWindowRange;
  readonly name: string;
  readonly load: number;
  readonly capacity: number;
  readonly commandWindow: CommandWindow;
}

export interface ConstellationStage {
  readonly id: ConstellationStageId;
  readonly name: string;
  readonly phase: ConstellationPhase;
  readonly windowRange: ConstellationWindowRange;
  readonly commandIds: readonly CommandId[];
}

export interface ConstellationStageEdge {
  readonly from: ConstellationStageId;
  readonly to: ConstellationStageId;
  readonly requiresReview: boolean;
}

export interface ConstellationConstraintSignal {
  readonly key: string;
  readonly value: number;
  readonly confidence: number;
}

export interface ConstellationArtifact {
  readonly id: ConstellationArtifactId;
  readonly name: string;
  readonly generatedAt: string;
  readonly stageId: ConstellationStageId;
  readonly score: number;
  readonly tags: readonly string[];
}

export interface ConstellationOrchestrationPlan {
  readonly id: ConstellationPlanId;
  readonly runId: ConstellationRunId;
  readonly tenant: ConstellationTenant;
  readonly title: string;
  readonly phase: ConstellationPhase;
  readonly stageIds: readonly ConstellationStageId[];
  readonly stages: readonly ConstellationStage[];
  readonly edges: readonly ConstellationStageEdge[];
  readonly commandIds: readonly CommandId[];
  readonly commands: readonly RecoveryCommand[];
  readonly windows: readonly ConstellationWindow[];
  readonly createdAt: string;
}

export interface ConstellationSignalEnvelope {
  readonly tenant: ConstellationTenant;
  readonly runId: ConstellationRunId;
  readonly planId: ConstellationPlanId;
  readonly stageId: ConstellationStageId;
  readonly event: ConstellationPluginEvent;
  readonly payload: Record<string, unknown>;
}

export interface ConstellationExecutionResult {
  readonly runId: ConstellationRunId;
  readonly planId: ConstellationPlanId;
  readonly artifacts: readonly ConstellationArtifact[];
  readonly stages: readonly ConstellationStage[];
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly plans: readonly CommandPlan[];
}

export interface ConstellationTelemetryPoint {
  readonly at: string;
  readonly stage: ConstellationStageId;
  readonly risk: number;
  readonly signal: ConstellationConstraintSignal;
}

export interface ConstellationDependencyProfile {
  readonly rootStage: ConstellationStageId;
  readonly chain: ConstellationStageId[];
  readonly dependencies: readonly ConstellationStageEdge[];
}

export type ConstellationPluginContextState = {
  readonly tenant: ConstellationTenant;
  readonly runId: ConstellationRunId;
  readonly plan: ConstellationOrchestrationPlan;
  readonly telemetry: readonly ConstellationTelemetryPoint[];
};

export interface ConstellationOrchestratorOverrides {
  readonly keepArtifacts?: boolean;
  readonly phaseWindow?: number;
}

export interface ConstellationOrchestratorInput {
  readonly tenant: ConstellationTenant;
  readonly plan: ConstellationOrchestrationPlan;
  readonly overrides?: ConstellationOrchestratorOverrides;
}

export interface ConstellationOrchestratorOutput {
  readonly summary: string;
  readonly result: ConstellationExecutionResult;
  readonly signals: readonly ConstellationSignalEnvelope[];
  readonly trace: readonly string[];
}

export const CONSTELLATION_PHASE_ORDER = ['scan', 'plan', 'simulate', 'execute', 'review'] as const satisfies readonly ConstellationPhase[];

export const toWindowRange = (start: string, end: string): ConstellationWindowRange => {
  const range = [start, end] as const;
  return Object.assign(range, { [CONSTELLATION_WINDOW_TAG]: undefined }) as ConstellationWindowRange;
};

const EMPTY_WINDOW: ConstellationWindowRange = toWindowRange(
  '1970-01-01T00:00:00.000Z',
  '1970-01-01T00:00:00.000Z',
);

export const planKeyPaths = (plan: ConstellationOrchestrationPlan): readonly KeyPaths<Pick<ConstellationOrchestrationPlan, 'title' | 'phase' | 'stages'>>[] =>
  ['title', 'phase', 'stages'] as const;

export const normalizeTelemetry = (telemetry: ConstellationTelemetryPoint[]): readonly ConstellationTelemetryPoint[] =>
  [...telemetry]
    .filter((point) => Number.isFinite(point.risk))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

export const stageIdsFromPlan = (plan: ConstellationOrchestrationPlan): NonEmptyArray<ConstellationStageId> =>
  plan.stageIds.length > 0
    ? (plan.stageIds as NonEmptyArray<ConstellationStageId>)
    : (['seed-stage'] as unknown as NonEmptyArray<ConstellationStageId>);

export const withDefaultWindow = (
  windowRange: ConstellationWindowRange | undefined,
): ConstellationWindowRange => (windowRange?.length === 2 ? windowRange : EMPTY_WINDOW);

export const isHighRiskPlan = (plan: ConstellationOrchestrationPlan): boolean =>
  plan.stages.some((stage) => stage.commandIds.length > 6) || plan.commands.some((command) => command.riskWeight > 8);
