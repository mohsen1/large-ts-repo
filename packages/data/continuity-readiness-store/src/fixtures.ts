import { randomUUID } from 'node:crypto';
import type { ReadinessSeed } from './types';
import type { ContinuityReadinessTenantId, ContinuityReadinessSurface, ContinuityReadinessSignal, ContinuityReadinessCandidatePlan } from '@domain/recovery-continuity-readiness';
import { withBrand } from '@shared/core';
import { ContinuityReadinessIds } from '@domain/recovery-continuity-readiness';

type Criticality = 'low' | 'medium' | 'high';

const mkSignal = (tenant: string, surface: string, index: number): ContinuityReadinessSignal => ({
  id: withBrand(`${tenant}-${surface}-${index}-${randomUUID()}`, 'ContinuityReadinessSignalId'),
  tenantId: withBrand(tenant, 'ContinuityReadinessTenantId'),
  surfaceId: withBrand(surface, 'ContinuityReadinessSurfaceId'),
  title: `signal-${index}`,
  source: 'model',
  severity: 45 + index,
  impact: 20 + (index % 3) * 10,
  confidence: 0.72,
  observedAt: new Date(Date.now() - index * 90_000).toISOString(),
  ageMinutes: index * 2,
  tags: ['fixture', `idx-${index}`],
  metadata: {
    fixture: true,
    source: 'seed',
  },
});

const mkPlan = (tenant: string, surface: string, index: number): ContinuityReadinessCandidatePlan => {
  const criticality: Criticality = index % 3 === 0 ? 'medium' : 'low';
  const signal = mkSignal(tenant, surface, index);
  return {
    id: withBrand(`plan-${tenant}-${surface}-${index}-${randomUUID()}`, 'ContinuityReadinessPlanId'),
    tenantId: withBrand(tenant, 'ContinuityReadinessTenantId'),
    label: `Plan ${index + 1}`,
    phase: 'observe',
    score: 80 - index,
    risk: criticality === 'medium' ? 'medium' : 'low',
    signals: [signal],
    runbook: [
      {
        id: withBrand(`step-${tenant}-${surface}-${index}-1`, 'ContinuityReadinessStepId'),
        order: 1,
        title: 'Observe cluster health',
        command: 'srectl health --surface',
        expectedDurationMinutes: 3,
        owner: 'engine',
      },
    ],
    objective: {
      id: withBrand(`objective-${tenant}-${index}`, 'ContinuityObjectiveId'),
      tenantId: withBrand(tenant, 'ContinuityReadinessTenantId'),
      targetRtoMinutes: 15,
      targetRpoMinutes: 5,
      slaName: 'Recovery readiness SLO',
      criticality: criticality,
      owners: ['ops', 'sre'],
    },
    createdBy: 'fixture',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    tags: ['fixture'],
  };
};

const mkSurface = (tenant: ContinuityReadinessTenantId, surface: string): ContinuityReadinessSurface => ({
  id: withBrand(surface, 'ContinuityReadinessSurfaceId'),
  tenantId: tenant,
  signals: [0, 1, 2, 3, 4].map((index) => mkSignal(String(tenant), surface, index)),
  plans: [0, 1, 2].map((index) => mkPlan(String(tenant), surface, index)),
  metrics: [
    {
      timestamp: new Date().toISOString(),
      latencyP95Ms: 210,
      availability: 99,
      throughputQps: 220,
      errorRate: 0.02,
    },
  ],
  lastUpdated: new Date().toISOString(),
});

export const readinessFixtures = (tenant: ContinuityReadinessTenantId): ReadinessSeed => ({
  tenantId: tenant,
  surfaces: [
    mkSurface(tenant, `${String(tenant)}-east`),
    mkSurface(tenant, `${String(tenant)}-west`),
  ],
});
