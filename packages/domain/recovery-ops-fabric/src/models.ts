import { Brand } from '@shared/core';

export type TenantId = Brand<string, 'TenantId'>;
export type FacilityId = Brand<string, 'FacilityId'>;
export type FabricNodeId = Brand<string, 'FabricNodeId'>;
export type FabricRunId = Brand<string, 'FabricRunId'>;
export type CommandId = Brand<string, 'CommandId'>;

export type AlertSeverity = 'notice' | 'warning' | 'critical' | 'incident';
export type HealthState = 'healthy' | 'degraded' | 'critical' | 'offline';

export interface AlertSignal {
  readonly id: CommandId;
  readonly tenantId: TenantId;
  readonly facilityId: FacilityId;
  readonly severity: AlertSeverity;
  readonly dimension: string;
  readonly value: number;
  readonly baseline: number;
  readonly timestamp: string;
  readonly tags: readonly string[];
}

export interface FabricCapacityProfile {
  readonly region: string;
  readonly requestedQps: number;
  readonly sustainableQps: number;
  readonly headroom: number;
  readonly projectedPeakQps: number;
}

export interface FabricEdge {
  readonly from: FabricNodeId;
  readonly to: FabricNodeId;
  readonly reliability: number;
  readonly latencyMs: number;
  readonly capacity: number;
  readonly lastValidatedAt: string;
}

export interface FabricNode {
  readonly id: FabricNodeId;
  readonly facilityId: FacilityId;
  readonly role: 'ingest' | 'routing' | 'compute' | 'persist' | 'egress';
  readonly health: HealthState;
  readonly cpu: number;
  readonly mem: number;
  readonly maxCapacity: number;
  readonly observedAt: string;
}

export interface FabricTopology {
  readonly tenantId: TenantId;
  readonly nodes: readonly FabricNode[];
  readonly edges: readonly FabricEdge[];
  readonly profiles: readonly FabricCapacityProfile[];
}

export interface FabricConstraint {
  readonly maxSkewMs: number;
  readonly maxRisk: number;
  readonly minHeadroom: number;
}

export interface FabricPlanStep {
  readonly stepId: string;
  readonly nodeId: FabricNodeId;
  readonly action: 'shift-traffic' | 'throttle' | 'repair-route' | 'scale-up';
  readonly rationale: string;
  readonly estimatedSavings: number;
  readonly risk: number;
  readonly tags: readonly string[];
}

export interface FabricPlan {
  readonly runId: FabricRunId;
  readonly tenantId: TenantId;
  readonly createdAt: string;
  readonly horizonMinutes: number;
  readonly constraint: FabricConstraint;
  readonly steps: readonly FabricPlanStep[];
  readonly commandsQueued: number;
  readonly confidence: number;
}

export interface FabricSimulationInput {
  readonly tenantId: TenantId;
  readonly facilityId: FacilityId;
  readonly topology: FabricTopology;
  readonly signals: readonly AlertSignal[];
  readonly constraint?: Partial<FabricConstraint>;
  readonly baselineDemand: number;
  readonly targetReliability: number;
}

export interface FabricSimulationResult {
  readonly runId: FabricRunId;
  readonly stress: number;
  readonly riskScore: number;
  readonly recommendationCount: number;
  readonly plan: FabricPlan;
  readonly confidence: number;
}

export interface FabricPolicy {
  readonly tenantId: TenantId;
  readonly allowedRoles: readonly FabricNode['role'][];
  readonly maxActionPerMinute: number;
  readonly allowRiskIncrease: number;
  readonly preferredActions: readonly FabricPlanStep['action'][];
}

export interface FabricPolicyViolation {
  readonly field: string;
  readonly reason: string;
  readonly severity: AlertSeverity;
}

export interface FabricPolicyResult {
  readonly ok: boolean;
  readonly violations: readonly FabricPolicyViolation[];
}

export interface FabricTelemetryEnvelope {
  readonly runId: FabricRunId;
  readonly payload: readonly {
    readonly kind: string;
    readonly score: number;
    readonly values: readonly number[];
  }[];
  readonly createdAt: string;
}

export const defaultFabricConstraint: FabricConstraint = {
  maxSkewMs: 300,
  maxRisk: 0.46,
  minHeadroom: 0.14,
};

export const isCriticalSignal = (signal: AlertSignal): boolean => {
  const ratio = signal.baseline > 0 ? signal.value / signal.baseline : 0;
  return signal.severity === 'critical' || signal.severity === 'incident' || ratio >= 1.18;
};

export const deriveTenant = (node: Pick<FabricNode, 'id'>): TenantId =>
  `tenant-${node.id}` as TenantId;

export const toCommandId = (facilityId: FacilityId, nodeId: FabricNodeId): CommandId =>
  `${facilityId}:${nodeId}:${Date.now()}` as CommandId;

export const normalizeSeverity = (severity: AlertSignal['severity']): number => {
  if (severity === 'notice') return 0.1;
  if (severity === 'warning') return 0.3;
  if (severity === 'critical') return 0.7;
  return 1;
};

export const signalHealthImpact = (signal: AlertSignal): number => {
  const ratio = signal.baseline > 0 ? signal.value / signal.baseline : 0;
  const deviation = Math.max(0, ratio - 1);
  return Number((deviation * normalizeSeverity(signal.severity)).toFixed(4));
};
