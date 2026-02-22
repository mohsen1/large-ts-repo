import type { Brand } from '@shared/core';

import type { Optionalize } from '@shared/type-level';

export type ContinuityTenantId = Brand<string, 'ContinuityTenantId'>;
export type ContinuityProgramId = Brand<string, 'ContinuityProgramId'>;
export type ContinuitySignalId = Brand<string, 'ContinuitySignalId'>;
export type ContinuitySnapshotId = Brand<string, 'ContinuitySnapshotId'>;
export type ContinuityWindowId = Brand<string, 'ContinuityWindowId'>;

export type LensSignalState = 'detected' | 'queued' | 'correlated' | 'resolved';
export type LensRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type LensTrend = 'stabilizing' | 'flat' | 'volatile' | 'degrading';
export type LensScope = 'service' | 'region' | 'provider' | 'tenant';

export interface ContinuityDimension {
  readonly dimension: LensScope;
  readonly key: string;
  readonly value: string;
}

export interface ContinuitySignalMetric {
  readonly metricName: string;
  readonly value: number;
  readonly unit: string;
  readonly source: string;
  readonly observedAt: string;
}

export interface ContinuitySignal {
  readonly id: ContinuitySignalId;
  readonly tenantId: ContinuityTenantId;
  readonly zone: string;
  readonly service: Brand<string, 'ContinuityServiceId'>;
  readonly component: Brand<string, 'ContinuityComponentId'>;
  readonly state: LensSignalState;
  readonly title: string;
  readonly description: string;
  readonly severity: number;
  readonly risk: LensRiskLevel;
  readonly scope: LensScope;
  readonly tags: readonly string[];
  readonly reportedAt: string;
  readonly dimensions: readonly ContinuityDimension[];
  readonly metrics: readonly ContinuitySignalMetric[];
}

export interface ContinuityProgramStep {
  readonly id: Brand<string, 'ContinuityProgramStepId'>;
  readonly name: string;
  readonly command: string;
  readonly dependsOn: readonly string[];
  readonly expectedDurationSeconds: number;
}

export interface ContinuityProgram {
  readonly id: ContinuityProgramId;
  readonly tenantId: ContinuityTenantId;
  readonly name: string;
  readonly purpose: string;
  readonly signals: readonly ContinuitySignalId[];
  readonly steps: readonly ContinuityProgramStep[];
  readonly createdAt: string;
  readonly owner: string;
  readonly active: boolean;
}

export interface ContinuitySnapshot {
  readonly id: ContinuitySnapshotId;
  readonly tenantId: ContinuityTenantId;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly riskScore: number;
  readonly trend: LensTrend;
  readonly signals: readonly ContinuitySignal[];
  readonly programs: readonly ContinuityProgram[];
}

export interface ContinuityWindow {
  readonly id: ContinuityWindowId;
  readonly tenantId: ContinuityTenantId;
  readonly from: string;
  readonly to: string;
  readonly horizonMinutes: number;
  readonly snapshotIds: readonly ContinuitySnapshotId[];
}

export interface SignalGraphEdge {
  readonly from: ContinuitySignalId;
  readonly to: ContinuitySignalId;
  readonly weight: number;
  readonly reason: string;
}

export interface SignalGraph {
  readonly tenantId: ContinuityTenantId;
  readonly signalIds: readonly ContinuitySignalId[];
  readonly edges: readonly SignalGraphEdge[];
  readonly orderedByTime: readonly ContinuitySignalId[];
  readonly cycleFree: boolean;
}

export interface ContinuityForecastRequest {
  readonly tenantId: ContinuityTenantId;
  readonly horizonMinutes: number;
  readonly maxSignals: number;
  readonly includeResolved: boolean;
}

export interface ContinuityRiskEvent {
  readonly id: Brand<string, 'ContinuityRiskEventId'>;
  readonly tenantId: ContinuityTenantId;
  readonly signalId: ContinuitySignalId;
  readonly confidence: number;
  readonly risk: LensRiskLevel;
  readonly cause: string;
  readonly observedAt: string;
}

export interface ContinuityForecast {
  readonly tenantId: ContinuityTenantId;
  readonly window: ContinuityWindow;
  readonly projectedRiskIndex: number;
  readonly trend: LensTrend;
  readonly hotspots: readonly ContinuityRiskEvent[];
  readonly recommendations: readonly string[];
}

export interface ContinuityPolicy {
  readonly id: Brand<string, 'ContinuityPolicyId'>;
  readonly tenantId: ContinuityTenantId;
  readonly name: string;
  readonly criticalityThreshold: number;
  readonly minimumSeverity: number;
  readonly allowAutoMitigation: boolean;
  readonly maxConcurrency: number;
}

export interface ContinuityPolicyViolation {
  readonly policyId: ContinuityPolicy['id'];
  readonly tenantId: ContinuityTenantId;
  readonly signalId: ContinuitySignalId;
  readonly timestamp: string;
  readonly reason: string;
  readonly severity: LensRiskLevel;
}

export interface ContinuityPolicyResult {
  readonly policy: ContinuityPolicy;
  readonly matches: number;
  readonly violations: readonly ContinuityPolicyViolation[];
  readonly approved: boolean;
}

export interface ContinuityWorkspace {
  readonly tenantId: ContinuityTenantId;
  readonly snapshot: ContinuitySnapshot;
  readonly graph: SignalGraph;
  readonly forecast: ContinuityForecast | undefined;
  readonly policies: readonly ContinuityPolicy[];
}

export interface ContinuityWorkspaceSummary {
  readonly tenantId: ContinuityTenantId;
  readonly windowId: string;
  readonly riskScore: number;
  readonly signalCount: number;
  readonly hasForecast: boolean;
}

export type ForecastInputs = Optionalize<
  ContinuityForecastRequest,
  'maxSignals' | 'includeResolved'
>;
