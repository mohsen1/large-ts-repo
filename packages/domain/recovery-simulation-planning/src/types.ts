import { Brand } from '@shared/core';

export type RecoverySimulationId = Brand<string, 'RecoverySimulationId'>;
export type RecoveryScenarioId = Brand<string, 'RecoveryScenarioId'>;
export type RecoveryRunId = Brand<string, 'RecoveryRunId'>;
export type RecoveryWindowToken = Brand<string, 'RecoveryWindowToken'>;

export type ScenarioPhase = 'preflight' | 'injection' | 'failover' | 'recovery' | 'verification';
export type ConstraintType = 'resource' | 'time' | 'dependency' | 'risk' | 'compliance';
export type ConstraintSeverity = 'info' | 'warning' | 'critical';
export type ReadinessState = 'idle' | 'warming' | 'live' | 'drained' | 'failed';

export interface RecoveryWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly timezone: string;
}

export interface ConstraintRule {
  readonly id: string;
  readonly type: ConstraintType;
  readonly severity: ConstraintSeverity;
  readonly title: string;
  readonly description: string;
  readonly affectedSteps: readonly string[];
  readonly tolerance: number;
}

export interface ScenarioStep {
  readonly id: string;
  readonly phase: ScenarioPhase;
  readonly title: string;
  readonly command: string;
  readonly expectedMinutes: number;
  readonly dependencies: readonly string[];
  readonly constraints: readonly string[];
  readonly readinessSignal?: string;
}

export interface ScenarioBlueprint {
  readonly id: RecoveryScenarioId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly owner: string;
  readonly title: string;
  readonly window: RecoveryWindow;
  readonly steps: readonly ScenarioStep[];
  readonly rules: readonly ConstraintRule[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SimulationProfile {
  readonly id: RecoverySimulationId;
  readonly scenario: ScenarioBlueprint;
  readonly runId: RecoveryRunId;
  readonly region: string;
  readonly blastRadiusScore: number;
  readonly targetRtoMinutes: number;
  readonly targetRpoMinutes: number;
  readonly concurrencyCap: number;
}

export interface SimulationSample {
  readonly stepId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly readinessState: ReadinessState;
  readonly metadata: Record<string, unknown>;
}

export interface SimulationResult {
  readonly id: RecoverySimulationId;
  readonly profile: SimulationProfile;
  readonly stepsExecuted: readonly string[];
  readonly samples: readonly SimulationSample[];
  readonly violations: readonly ConstraintViolation[];
  readonly riskScore: number;
  readonly readinessAtEnd: ReadinessState;
  readonly executedAt: string;
  readonly durationMs: number;
}

export interface ConstraintViolation {
  readonly ruleId: string;
  readonly stepId: string;
  readonly message: string;
  readonly scoreImpact: number;
  readonly observedAt: string;
}

export interface RuntimeDecisionPoint {
  readonly simulationId: RecoverySimulationId;
  readonly stepId: string;
  readonly reasonCode: string;
  readonly autoRemediated: boolean;
  readonly options: readonly string[];
}

export interface SimulationSummary {
  readonly id: RecoverySimulationId;
  readonly scenarioId: RecoveryScenarioId;
  readonly status: 'ok' | 'degraded' | 'failed';
  readonly score: number;
  readonly readinessState: ReadinessState;
  readonly failureCount: number;
  readonly recommendedActions: readonly string[];
}

export interface SimulationWorkspace {
  readonly scenarioId: RecoveryScenarioId;
  readonly runId: RecoveryRunId;
  readonly token: RecoveryWindowToken;
  readonly activeStepIds: readonly string[];
  readonly disabledStepIds: readonly string[];
  readonly createdAt: string;
}
