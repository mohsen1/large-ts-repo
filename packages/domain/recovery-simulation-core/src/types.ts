import type { Brand } from '@shared/core';

export type SimulationRunId = Brand<string, 'SimulationRunId'>;
export type SimulationPlanId = Brand<string, 'SimulationPlanId'>;
export type SimulationScenarioId = Brand<string, 'SimulationScenarioId'>;
export type SimulationStepId = Brand<string, 'SimulationStepId'>;
export type SimulationTargetId = Brand<string, 'SimulationTargetId'>;
export type SimulationActorId = Brand<string, 'SimulationActorId'>;

export type SimulationState = 'queued' | 'executing' | 'stalled' | 'completed' | 'cancelled' | 'failed';
export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';
export type RiskSurface = 'infra' | 'app' | 'data' | 'person' | 'third-party';

export interface SimulationActor {
  readonly id: SimulationActorId;
  readonly name: string;
  readonly ownedService: string;
  readonly contact: string;
}

export interface SimulationTarget {
  readonly id: SimulationTargetId;
  readonly label: string;
  readonly region: string;
  readonly serviceClass: 'critical' | 'important' | 'support';
  readonly owner: string;
  readonly dependencies: readonly SimulationTargetId[];
}

export interface SimulationStepSpec {
  readonly id: SimulationStepId;
  readonly title: string;
  readonly targetId: SimulationTargetId;
  readonly expectedDurationMs: number;
  readonly requiredActors: readonly SimulationActorId[];
  readonly tags: readonly string[];
  readonly riskSurface: RiskSurface;
  readonly recoveryCriticality: 1 | 2 | 3 | 4 | 5;
  readonly dependsOn: readonly SimulationStepId[];
}

export interface SimulationScenarioBlueprint {
  readonly id: SimulationScenarioId;
  readonly title: string;
  readonly description: string;
  readonly severity: SeverityBand;
  readonly owner: string;
  readonly tags: readonly string[];
  readonly targets: readonly SimulationTarget[];
  readonly steps: readonly SimulationStepSpec[];
}

export interface SimulationPlanManifest {
  readonly id: SimulationPlanId;
  readonly scenarioId: SimulationScenarioId;
  readonly createdAt: string;
  readonly requestedBy: string;
  readonly steps: readonly SimulationStepSpec[];
  readonly expectedRecoveryBudgetMs: number;
  readonly concurrencyLimit: number;
  readonly objective: string;
}

export interface SimulationStepExecution {
  readonly stepId: SimulationStepId;
  readonly state: SimulationState;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly operatorNote?: string;
  readonly metrics: readonly { readonly key: string; readonly value: number }[];
}

export interface SimulationRunRecord {
  readonly id: SimulationRunId;
  readonly planId: SimulationPlanId;
  readonly scenarioId: SimulationScenarioId;
  readonly createdAt: string;
  readonly state: SimulationState;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly totalDurationMs?: number;
  readonly executedSteps: readonly SimulationStepExecution[];
  readonly incidentsDetected: number;
  readonly residualRiskScore: number;
}

export interface SimulationCommand {
  readonly requestId: string;
  readonly runId: SimulationRunId;
  readonly actorId: SimulationActorId;
  readonly command: 'start' | 'skip-step' | 'pause' | 'resume' | 'abort';
  readonly requestedAt: string;
}

export interface SimulationBatchResult {
  readonly runId: SimulationRunId;
  readonly summary: string;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly elapsedMs: number;
  readonly commandCount: number;
}

export interface SimulationClock {
  now(): string;
}

export interface SimulationClockSample {
  readonly startedAt: string;
  readonly completedAt: string;
}

export type SimulationTimeline = readonly SimulationStepId[];

export type GroupBy<T extends Record<string, unknown>, K extends keyof T> = {
  readonly [V in T[K] & (string | number)]: readonly Extract<T, Record<K, V>>[];
};

export const normalizeTimestamp = (value: string): string => new Date(value).toISOString();

export const calculateResidualRisk = (incidents: number, completed: number, total: number): number => {
  const normalizedCompletion = Math.min(1, Math.max(0, completed / Math.max(1, total)));
  const incidentPressure = incidents / Math.max(1, total);
  return Number((incidentPressure + (1 - normalizedCompletion) * 0.6).toFixed(3));
};

export const makeSimulationClock = (now: () => string = () => new Date().toISOString()): SimulationClock => ({ now });

export const clonePlanSteps = (steps: readonly SimulationStepSpec[]): SimulationStepSpec[] =>
  steps.map((step) => ({ ...step, requiredActors: [...step.requiredActors], dependsOn: [...step.dependsOn], tags: [...step.tags] }));
