import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';

export type IncidentDomain = 'network' | 'platform' | 'database' | 'region' | 'security';
export type SignalSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type ExecutionMode = 'dry-run' | 'staged' | 'auto' | 'manual';
export type ScenarioState = 'draft' | 'queued' | 'active' | 'suspended' | 'retired';

export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type PlanRevision = Brand<number, 'PlanRevision'>;
export type WindowId = Brand<string, 'WindowId'>;

export interface SignalCoordinate {
  readonly lat: number;
  readonly lon: number;
  readonly region: string;
}

export interface RawIncidentSignal {
  readonly signalId: string;
  readonly incidentId: IncidentId;
  readonly service: string;
  readonly domain: IncidentDomain;
  readonly severity: SignalSeverity;
  readonly observedAt: string;
  readonly value: number;
  readonly details: Record<string, string | number | boolean | null>;
  readonly tags: readonly string[];
}

export interface SignalWindow {
  readonly windowId: WindowId;
  readonly startAt: string;
  readonly endAt: string;
  readonly expectedSignalCount: number;
}

export interface IncidentContext {
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly ownerTeam: string;
  readonly services: readonly string[];
  readonly window: SignalWindow;
  readonly domains: readonly IncidentDomain[];
  readonly runMode: ExecutionMode;
}

export interface RecoveryStepTemplate {
  readonly templateId: string;
  readonly stepType: string;
  readonly estimatedMinutes: number;
  readonly preconditions: readonly string[];
  readonly sideEffects: readonly string[];
}

export interface RecoveryScenarioTemplate {
  readonly templateId: Brand<string, 'RecoveryScenarioTemplateId'>;
  readonly title: string;
  readonly description: string;
  readonly tenantId: TenantId;
  readonly domain: IncidentDomain;
  readonly planMode: ExecutionMode;
  readonly targets: readonly string[];
  readonly signals: readonly string[];
  readonly steps: readonly RecoveryStepTemplate[];
  readonly state: ScenarioState;
}

export interface RecoveryPlanWindow {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly confidence: number;
  readonly riskScore: number;
  readonly signalDensity: number;
  readonly label: string;
}

export interface ScenarioBudget {
  readonly maxParallelism: number;
  readonly budgetMinutes: number;
  readonly budgetCostUnits: number;
  readonly riskTolerance: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface ScenarioCandidate {
  readonly scenarioId: Brand<string, 'RecoveryScenarioId'>;
  readonly tenantId: TenantId;
  readonly context: IncidentContext;
  readonly planWindow: RecoveryPlanWindow;
  readonly template: RecoveryScenarioTemplate;
  readonly revision: PlanRevision;
  readonly budget: ScenarioBudget;
  readonly generatedAt: string;
}

export interface ScenarioTraceEvent {
  readonly when: string;
  readonly component: string;
  readonly message: string;
  readonly tags: Record<string, string>;
  readonly correlationId: string;
}

export interface ValidationSummary {
  readonly candidateId: string;
  readonly passed: boolean;
  readonly blockedReasons: readonly string[];
  readonly warnings: readonly string[];
}

export interface SimulationEnvelope {
  readonly id: string;
  readonly revision: PlanRevision;
  readonly candidate: ScenarioCandidate;
  readonly traces: readonly ScenarioTraceEvent[];
  readonly windows: readonly RecoveryPlanWindow[];
  readonly checks: readonly ValidationSummary[];
}

export interface OrchestrationSignal {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly signal: string;
  readonly value: number;
  readonly timestamp: string;
  readonly coordinate?: SignalCoordinate;
}

export interface PlanSynthesisReport {
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly candidateCount: number;
  readonly selectedCandidate?: Brand<string, 'RecoveryScenarioId'>;
  readonly totalRisk: number;
  readonly estimatedDurationMinutes: number;
  readonly generatedAt: string;
}

export interface OrchestrationSnapshot {
  readonly tenantId: TenantId;
  readonly windowId: WindowId;
  readonly candidates: readonly ScenarioCandidate[];
  readonly selected: readonly Brand<string, 'RecoveryScenarioId'>[];
  readonly mode: ExecutionMode;
  readonly timestamp: string;
}

export const createPlanRevision = (value: number): PlanRevision => Math.max(1, Math.floor(value)) as PlanRevision;

export const createWindowId = (tenant: string, seed: string): WindowId => withBrand(`${tenant}:${seed}`, 'WindowId');

export const normalizeSignalDensity = (signalCount: number, durationMinutes: number): number => {
  const denominator = Math.max(1, durationMinutes);
  return Number((signalCount / denominator).toFixed(3));
};

export const buildSignalWindow = (start: string, durationMinutes: number, windowId: WindowId): SignalWindow => ({
  windowId,
  startAt: start,
  endAt: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
  expectedSignalCount: durationMinutes * 3,
});

export const buildPlanWindow = (startMinute: number, durationMinutes: number, riskScore: number): RecoveryPlanWindow => {
  const adjustedRisk = Math.max(0, Math.min(100, riskScore));
  return {
    startMinute,
    endMinute: startMinute + durationMinutes,
    confidence: Math.max(10, 100 - adjustedRisk),
    riskScore: adjustedRisk,
    signalDensity: normalizeSignalDensity(durationMinutes * 2, Math.max(1, durationMinutes)),
    label: durationMinutes > 45 ? 'extended' : durationMinutes > 20 ? 'balanced' : 'rapid',
  };
};
