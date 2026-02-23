import type { ContinuityReadinessSignal, ContinuityReadinessSurface, ContinuityReadinessEnvelope } from './types';
import { ContinuityReadinessIds } from './types';

export interface ExternalSignalPayload {
  readonly tenant: string;
  readonly surface: string;
  readonly title: string;
  readonly score: number;
  readonly impact: number;
  readonly confidence: number;
}

export interface ExternalPlanPayload {
  readonly id: string;
  readonly score: number;
  readonly active: boolean;
}

export const adaptSignalFromLegacy = (payload: ExternalSignalPayload): Omit<ContinuityReadinessSignal, 'tenantId' | 'surfaceId' | 'id'> => ({
  title: payload.title,
  source: 'model',
  severity: payload.score,
  impact: payload.impact,
  confidence: payload.confidence,
  observedAt: new Date().toISOString(),
  ageMinutes: 0,
  tags: ['legacy-adapter', payload.tenant],
  metadata: {
    surface: payload.surface,
    tenant: payload.tenant,
    normalized: true,
  },
});

export const adaptSurfaceToEnvelope = (
  surface: ContinuityReadinessSurface,
  runId: string,
): ContinuityReadinessEnvelope => ({
  tenantId: surface.tenantId,
  surface,
  coverage: [],
  run: {
    id: ContinuityReadinessIds.run(runId),
    surfaceId: surface.id,
    tenantId: surface.tenantId,
    planId: surface.plans[0]?.id ?? ContinuityReadinessIds.plan(`${String(surface.tenantId)}-fallback-${surface.id}`),
    phase: 'observe',
    startedAt: new Date().toISOString(),
    startedBy: 'adapter',
    expectedFinishAt: new Date(Date.now() + 3600_000).toISOString(),
    currentScore: 55,
    riskBand: 'medium',
    active: true,
    metadata: {
      source: 'adapter',
    },
  },
  projection: {
    horizonMinutes: 90,
    trend: 'flat',
    confidence: 0.8,
    meanScore: 56,
    volatility: 1.2,
    points: [58, 56, 54, 57],
  },
});

export const adaptPlanActivation = (
  plan: Omit<ContinuityReadinessSurface, 'metrics' | 'lastUpdated'>,
  active: boolean,
): Omit<ExternalPlanPayload, 'id'> => ({
  score: plan.plans.reduce((sum, item) => sum + item.score, 0) / Math.max(1, plan.plans.length),
  active,
});
