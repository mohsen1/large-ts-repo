import { Brand } from '@shared/core';
import { NonEmptyArray, Optionalize } from '@shared/observability-contracts';

export type IncidentId = Brand<string, 'IncidentId'>;
export type PolicyId = Brand<string, 'PolicyId'>;
export type RunId = Brand<string, 'RunId'>;
export type StrategyId = Brand<string, 'StrategyId'>;

export type ImpactBand = 'low' | 'medium' | 'high' | 'critical';
export type SignalKind = 'error-rate' | 'latency' | 'availability' | 'cost-variance' | 'manual-flag';
export type DriftDirection = 'up' | 'down';

export interface SignalSample {
  kind: SignalKind;
  value: number;
  unit: string;
  at: string;
}

export interface ServiceWindow {
  startsAt: string;
  endsAt: string;
  zone: string;
}

export interface ServiceDependency {
  serviceId: Brand<string, 'ServiceId'>;
  required: boolean;
  resilienceBudget: number;
}

export interface DriftProfile {
  dimensions: readonly string[];
  expectedDirection: DriftDirection;
  threshold: number;
  tolerance: number;
}

export interface AdaptivePolicy {
  id: PolicyId;
  tenantId: Brand<string, 'TenantId'>;
  name: string;
  active: boolean;
  dependencies: readonly ServiceDependency[];
  window: ServiceWindow;
  allowedSignalKinds: readonly SignalKind[];
  driftProfile?: DriftProfile;
}

export interface SignalContext {
  tenantId: Brand<string, 'TenantId'>;
  services: readonly Brand<string, 'ServiceId'>[];
  window: ServiceWindow;
}

export interface AdaptiveAction {
  type: 'scale-up' | 'reroute' | 'throttle' | 'failover' | 'notify';
  intensity: number;
  targets: NonEmptyArray<Brand<string, 'ServiceId'>>;
  justification: string;
}

export interface AdaptiveDecision {
  policyId: PolicyId;
  incidentId: IncidentId;
  confidence: number;
  selectedActions: readonly AdaptiveAction[];
  risk: ImpactBand;
  runbook: Optionalize<Runbook, 'owner'>;
}

export interface Runbook {
  id: RunId;
  owner: string;
  strategy: readonly AdaptiveAction[];
  expectedRecoveryMinutes: number;
  description: string;
}

export interface AdaptiveRun {
  incidentId: IncidentId;
  policyId: PolicyId;
  serviceWindow: ServiceWindow;
  createdAt: string;
  updatedAt: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  decisions: readonly AdaptiveDecision[];
}

export const asPolicyId = (value: string): PolicyId => value as PolicyId;
export const asIncidentId = (value: string): IncidentId => value as IncidentId;
export const asRunId = (value: string): RunId => value as RunId;
export const asStrategyId = (value: string): StrategyId => value as StrategyId;
