import type { Brand } from '@shared/core';
import type { DeepMerge } from '@shared/type-level';

export type PlaybookId = Brand<string, 'PlaybookId'>;
export type PlaybookStepId = Brand<string, 'PlaybookStepId'>;
export type RunbookRunId = Brand<string, 'RunbookRunId'>;

export type StepKind = 'assess' | 'notify' | 'isolate' | 'restore' | 'verify' | 'postmortem';
export type RiskTier = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type PlaybookScope = 'global' | 'region' | 'service' | 'workload';
export type Severity = 'minor' | 'major' | 'catastrophic';

export interface TimelineWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly timezone: string;
}

export interface StepOutcome {
  readonly status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  readonly attempt: number;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly details: Readonly<Record<string, string>>;
  readonly nextStepIds: readonly PlaybookStepId[];
}

export interface PlaybookStepTemplate {
  readonly id: PlaybookStepId;
  readonly title: string;
  readonly kind: StepKind;
  readonly scope: PlaybookScope;
  readonly ownerTeam: string;
  readonly dependencies: readonly PlaybookStepId[];
  readonly expectedLatencyMinutes: number;
  readonly riskDelta: number;
  readonly automationLevel: number;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  readonly actions: readonly PlaybookAction[];
}

export interface PlaybookAction {
  readonly type: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PlaybookBlueprint {
  readonly id: PlaybookId;
  readonly title: string;
  readonly service: string;
  readonly severity: Severity;
  readonly tier: RiskTier;
  readonly timeline: TimelineWindow;
  readonly owner: string;
  readonly labels: readonly string[];
  readonly steps: readonly PlaybookStepTemplate[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PlaybookRun {
  readonly id: RunbookRunId;
  readonly playbookId: PlaybookId;
  readonly triggeredBy: string;
  readonly startedAt: string;
  readonly window: TimelineWindow;
  readonly status: 'draft' | 'active' | 'paused' | 'completed' | 'aborted';
  readonly outcomeByStep: ReadonlyRecord<PlaybookStepId, StepOutcome>;
  readonly notes: readonly string[];
}

export interface ReadinessSignal {
  readonly stepId: PlaybookStepId;
  readonly score: number;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface RunbookIntent {
  readonly playbookId: PlaybookId;
  readonly trigger: string;
  readonly reason: string;
  readonly readinessSignals: readonly ReadinessSignal[];
}

export type SeverityVector = Readonly<Record<Severity, number>>;
export type ReadonlyRecord<K extends string | number | symbol, V> = Readonly<Record<K, V>>;

export interface PlaybookExecutionPlan {
  readonly runbook: PlaybookRun;
  readonly order: readonly PlaybookStepId[];
  readonly riskProfile: SeverityVector;
  readonly merged: MergeConfig;
}

export interface MergeConfig {
  readonly preferParallelism: boolean;
  readonly maxParallelSteps: number;
  readonly autoEscalate: boolean;
  readonly rollbackPolicy: {
    enabled: boolean;
    maxLatencyMinutes: number;
    requiresApproval: boolean;
  };
}

export interface PlaybookProjection {
  readonly playbookId: PlaybookId;
  readonly runId: RunbookRunId;
  readonly activeStep: PlaybookStepId | null;
  readonly completedSteps: readonly PlaybookStepId[];
  readonly failedSteps: readonly PlaybookStepId[];
  readonly confidence: number;
}

export type RiskEnvelope = DeepMerge<SeverityVector, { readonly overall: number; readonly tags: readonly string[] }>;

export interface FleetSignals {
  readonly runId: RunbookRunId;
  readonly alerts: readonly string[];
  readonly controls: readonly string[];
  readonly observedSkewSeconds: number;
}

export interface PlaybookSearchFilters {
  readonly scope?: PlaybookScope;
  readonly owner?: string;
  readonly minTier?: RiskTier;
  readonly since?: string;
  readonly until?: string;
}
