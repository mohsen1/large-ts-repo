import { withBrand, normalizeLimit, type Brand, type PageArgs, type PageResult, type WithId } from '@shared/core';
import type { DeepReadonly } from '@shared/type-level';

export type ContinuityReadinessTenantId = Brand<string, 'ContinuityReadinessTenantId'>;
export type ContinuityReadinessPlanId = Brand<string, 'ContinuityReadinessPlanId'>;
export type ContinuityReadinessSurfaceId = Brand<string, 'ContinuityReadinessSurfaceId'>;
export type ContinuityReadinessSignalId = Brand<string, 'ContinuityReadinessSignalId'>;
export type ContinuityReadinessRunId = Brand<string, 'ContinuityReadinessRunId'>;

export type ContinuityReadinessPhase =
  | 'observe'
  | 'stabilize'
  | 'validate'
  | 'handoff';

export type ContinuityRiskBand = 'low' | 'medium' | 'high' | 'critical';
export type ContinuitySignalSource = 'sensor' | 'manual' | 'model' | 'advisor';
export type ContinuityReadinessTrend = 'improving' | 'degrading' | 'flat' | 'volatile';

export interface ContinuityReadinessSignal {
  readonly id: ContinuityReadinessSignalId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly title: string;
  readonly source: ContinuitySignalSource;
  readonly severity: number;
  readonly impact: number;
  readonly confidence: number;
  readonly observedAt: string;
  readonly ageMinutes: number;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface ContinuityObjective {
  readonly id: Brand<string, 'ContinuityObjectiveId'>;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly targetRtoMinutes: number;
  readonly targetRpoMinutes: number;
  readonly slaName: string;
  readonly criticality: ContinuityRiskBand;
  readonly owners: readonly string[];
}

export interface ContinuityReadinessWindow {
  readonly from: string;
  readonly to: string;
  readonly minutes: number;
}

export interface ContinuityReadinessMetricSnapshot {
  readonly timestamp: string;
  readonly latencyP95Ms: number;
  readonly availability: number;
  readonly throughputQps: number;
  readonly errorRate: number;
}

export interface ContinuityReadinessRunbookStep {
  readonly id: Brand<string, 'ContinuityReadinessStepId'>;
  readonly order: number;
  readonly title: string;
  readonly command: string;
  readonly expectedDurationMinutes: number;
  readonly owner: string;
}

export interface ContinuityReadinessCandidatePlan {
  readonly id: ContinuityReadinessPlanId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly label: string;
  readonly phase: ContinuityReadinessPhase;
  readonly score: number;
  readonly risk: ContinuityRiskBand;
  readonly signals: readonly ContinuityReadinessSignal[];
  readonly runbook: readonly ContinuityReadinessRunbookStep[];
  readonly objective: ContinuityObjective;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly tags: readonly string[];
}

export interface ContinuityReadinessSurface {
  readonly id: ContinuityReadinessSurfaceId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly signals: readonly ContinuityReadinessSignal[];
  readonly plans: readonly ContinuityReadinessCandidatePlan[];
  readonly metrics: readonly ContinuityReadinessMetricSnapshot[];
  readonly lastUpdated: string;
}

export interface ContinuityReadinessRun {
  readonly id: ContinuityReadinessRunId;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly planId: ContinuityReadinessPlanId;
  readonly phase: ContinuityReadinessPhase;
  readonly startedAt: string;
  readonly startedBy: string;
  readonly expectedFinishAt: string;
  readonly currentScore: number;
  readonly riskBand: ContinuityRiskBand;
  readonly active: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ContinuityReadinessCoverage {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly objectiveId: ContinuityObjective['id'];
  readonly objectiveName: string;
  readonly score: number;
  readonly weight: number;
  readonly riskBand: ContinuityRiskBand;
}

export interface ContinuityReadinessProjection {
  readonly horizonMinutes: number;
  readonly trend: ContinuityReadinessTrend;
  readonly confidence: number;
  readonly meanScore: number;
  readonly volatility: number;
  readonly points: readonly number[];
}

export interface ContinuityReadinessEnvelope {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly surface: ContinuityReadinessSurface;
  readonly coverage: readonly ContinuityReadinessCoverage[];
  readonly run: ContinuityReadinessRun | null;
  readonly projection: ContinuityReadinessProjection;
}

export interface ContinuityReadinessPageArgs extends Omit<PageArgs, 'cursor'> {
  readonly tenantId?: ContinuityReadinessTenantId;
  readonly minRisk?: ContinuityRiskBand;
  readonly from?: string;
  readonly to?: string;
}

export interface ContinuityReadinessPageResult<T> extends Omit<PageResult<T>, 'items'> {
  readonly items: DeepReadonly<T[]>;
}

export interface ContinuityReadinessSelection {
  readonly planId: ContinuityReadinessPlanId;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ContinuityReadinessWorkspace extends Omit<WithId, 'id'> {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly tenantName: string;
  readonly selectedPlanId: ContinuityReadinessPlanId;
  readonly projection: ContinuityReadinessProjection;
  readonly coverage: readonly ContinuityReadinessCoverage[];
}

export const ContinuityReadinessIds = {
  tenant: (value: string): ContinuityReadinessTenantId => withBrand(value, 'ContinuityReadinessTenantId'),
  surface: (value: string): ContinuityReadinessSurfaceId => withBrand(value, 'ContinuityReadinessSurfaceId'),
  signal: (value: string): ContinuityReadinessSignalId => withBrand(value, 'ContinuityReadinessSignalId'),
  plan: (value: string): ContinuityReadinessPlanId => withBrand(value, 'ContinuityReadinessPlanId'),
  run: (value: string): ContinuityReadinessRunId => withBrand(value, 'ContinuityReadinessRunId'),
} as const;

export const limitContinuityPage = (limit: number | undefined): number => normalizeLimit(limit);

const isRiskBand = (value: unknown): value is ContinuityRiskBand => value === 'low' || value === 'medium' || value === 'high' || value === 'critical';

const toString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

export const parseContinuityReadinessQuery = (input: unknown): ContinuityReadinessPageArgs => {
  if (!input || typeof input !== 'object') {
    return { limit: limitContinuityPage(undefined) };
  }

  const candidate = input as Record<string, unknown>;
  const tenantId = toString(candidate.tenantId);
  const minRisk = candidate.minRisk;
  const from = toString(candidate.from);
  const to = toString(candidate.to);
  const limit = toNumber(candidate.limit);

  return {
    tenantId: tenantId ? ContinuityReadinessIds.tenant(tenantId) : undefined,
    minRisk: isRiskBand(minRisk) ? minRisk : undefined,
    from,
    to,
    limit: limitContinuityPage(limit),
  };
};
