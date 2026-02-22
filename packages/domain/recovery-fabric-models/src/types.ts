import { Brand, withBrand } from '@shared/core';

export type FabricPlanId = Brand<string, 'FabricPlanId'>;
export type FabricRunId = Brand<string, 'FabricRunId'>;
export type FabricNodeId = Brand<string, 'FabricNodeId'>;
export type FabricLinkId = Brand<string, 'FabricLinkId'>;
export type FabricZone = 'global' | 'edge' | 'core' | 'satellite';

export interface FabricNode {
  readonly id: FabricNodeId;
  readonly name: string;
  readonly zone: FabricZone;
  readonly serviceId: Brand<string, 'ServiceId'>;
  readonly tenantId: Brand<string, 'TenantId'>;
  readonly readiness: number;
  readonly resilienceScore: number;
  readonly capabilities: readonly string[];
}

export interface FabricLink {
  readonly id: FabricLinkId;
  readonly from: FabricNodeId;
  readonly to: FabricNodeId;
  readonly latencyMs: number;
  readonly costUnits: number;
  readonly region: string;
}

export interface FabricWindow {
  readonly startedAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly blackoutAt?: readonly string[];
}

export interface FabricConstraint {
  readonly code: 'rto' | 'compliance' | 'dependency' | 'vendor' | 'manual';
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly description: string;
  readonly requiredWindow?: FabricWindow;
}

export interface FabricObjective {
  readonly id: Brand<string, 'FabricObjectiveId'>;
  readonly name: string;
  readonly targetRtoMinutes: number;
  readonly targetRpoMinutes: number;
  readonly maxConcurrentSteps: number;
  readonly tags: readonly string[];
}

export type FabricEdgeKind = 'primary' | 'secondary' | 'fallback';

export interface FabricRoute {
  readonly id: Brand<string, 'FabricRouteId'>;
  readonly sourceNode: FabricNodeId;
  readonly targetNode: FabricNodeId;
  readonly kind: FabricEdgeKind;
  readonly capacity: number;
  readonly estimatedDurationMinutes: number;
  readonly constraints: readonly FabricConstraint[];
}

export interface FabricScenario {
  readonly id: FabricPlanId;
  readonly tenantId: Brand<string, 'TenantId'>;
  readonly objective: FabricObjective;
  readonly nodes: readonly FabricNode[];
  readonly links: readonly FabricLink[];
  readonly routes: readonly FabricRoute[];
  readonly window: FabricWindow;
}

export interface FabricCandidate {
  readonly id: Brand<string, 'FabricCandidateId'>;
  readonly scenarioId: FabricPlanId;
  readonly planNodeIds: readonly FabricNodeId[];
  readonly routeIds: readonly Brand<string, 'FabricRouteId'>[];
  readonly rationale: string;
}

export interface FabricTrace {
  readonly runId: FabricRunId;
  readonly planId: FabricPlanId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'draft' | 'running' | 'suspended' | 'completed' | 'failed';
  readonly currentNodeId?: FabricNodeId;
}

export interface FabricPlanStats {
  readonly nodeCount: number;
  readonly linkCount: number;
  readonly routeCount: number;
  readonly averageLatencyMs: number;
  readonly resilienceMean: number;
}

export interface FabricPlanProfile {
  readonly planId: FabricPlanId;
  readonly totalCostUnits: number;
  readonly estimatedMinutes: number;
  readonly riskScore: number;
}

export const makeFabricNodeId = (value: string): FabricNodeId => withBrand(value, 'FabricNodeId');
export const makeFabricLinkId = (value: string): FabricLinkId => withBrand(value, 'FabricLinkId');
export const makeFabricPlanId = (value: string): FabricPlanId => withBrand(value, 'FabricPlanId');
export const makeFabricRunId = (value: string): FabricRunId => withBrand(value, 'FabricRunId');

export interface FabricAllocation {
  readonly tenantId: Brand<string, 'TenantId'>;
  readonly allocatedNodeIds: readonly FabricNodeId[];
  readonly expectedRecoveryMinutes: number;
  readonly canaryOrder: readonly FabricNodeId[];
}

export interface FabricTopologyEdge {
  readonly from: FabricNodeId;
  readonly to: FabricNodeId;
  readonly edgeIndex: number;
  readonly active: boolean;
}

export interface FabricTopologySnapshot {
  readonly nodes: readonly FabricNode[];
  readonly edges: readonly FabricTopologyEdge[];
  readonly generatedAt: string;
}
