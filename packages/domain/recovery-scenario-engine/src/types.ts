import type { Brand } from '@shared/core';
import type { BrandMap } from '@shared/type-level';

export type ScenarioId = Brand<string, 'ScenarioId'>;
export type ProgramId = Brand<string, 'ProgramId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;

export type IncidentSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RecoveryState = 'idle' | 'triage' | 'active' | 'cooldown' | 'resolved' | 'quarantined';

export interface SignalFingerprint {
  metric: string;
  value: number;
  unit: string;
  dimension: Record<string, string>;
  observedAt: string;
}

export interface ScenarioConstraint {
  key: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
  threshold: number;
  windowMinutes: number;
}

export interface ScenarioAction {
  code: string;
  owner: string;
  command: string;
  requiredApprovals: number;
  estimatedMinutes: number;
  tags: readonly string[];
}

export interface RecoveryScenario {
  id: ScenarioId;
  tenantId: TenantId;
  programId: ProgramId;
  name: string;
  description: string;
  severity: IncidentSeverity;
  state: RecoveryState;
  constraints: readonly ScenarioConstraint[];
  actions: readonly ScenarioAction[];
  tags: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export type BrandedRecord<K extends string, T extends string> = BrandMap<K, T>;

export interface IncidentContext {
  incidentId: IncidentId;
  scenarioId: ScenarioId;
  tenantId: TenantId;
  service: string;
  region: string;
  detectedAt: string;
  signals: readonly SignalFingerprint[];
  rawMetadata: Record<string, unknown>;
}

export interface PlannedRun {
  runId: Brand<string, 'RecoveryRunId'>;
  incidentId: IncidentId;
  scenarioId: ScenarioId;
  actionCodes: readonly string[];
  estimatedMinutes: number;
  requiresManualApproval: boolean;
}

export interface ScenarioDecision<TContext = IncidentContext> {
  scenarioId: ScenarioId;
  incidentContext: TContext;
  confidence: number;
  rationale: readonly string[];
  actions: readonly ScenarioAction[];
}

export interface RuntimeMetrics {
  windowStart: string;
  windowEnd: string;
  matchedSignals: number;
  meanSignalValue: number;
  maxSignalValue: number;
  uniqueDimensions: number;
}

export type ScenarioEnvelope<TContext extends IncidentContext = IncidentContext> = {
  scenario: RecoveryScenario;
  context: TContext;
  decision: ScenarioDecision<TContext>;
  metrics: RuntimeMetrics;
};

export interface ScenarioFilter {
  tenantId?: TenantId;
  state?: RecoveryState;
  severities?: readonly IncidentSeverity[];
  tags?: readonly string[];
  changedSince?: string;
}
