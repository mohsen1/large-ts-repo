import type {
  ContinuityReadinessRun,
  ContinuityReadinessSurface,
  ContinuityReadinessEnvelope,
  ContinuityReadinessTenantId,
  ContinuityReadinessSurfaceId,
  ContinuityReadinessPlanId,
  ContinuityReadinessRunId,
} from '@domain/recovery-continuity-readiness';
import type { ReadinessSearchResult } from './types';

export interface ReadinessSort {
  readonly by: 'updated' | 'risk' | 'score';
  readonly direction: 'asc' | 'desc';
}

const comparator = (a: ContinuityReadinessSurface, b: ContinuityReadinessSurface, by: ReadinessSort['by']): number => {
  switch (by) {
    case 'score': {
      const aScore = a.plans.reduce((sum, plan) => sum + plan.score, 0) / Math.max(1, a.plans.length);
      const bScore = b.plans.reduce((sum, plan) => sum + plan.score, 0) / Math.max(1, b.plans.length);
      return aScore - bScore;
    }
    case 'risk': {
      const aRisk = Math.max(...a.plans.map((plan) => {
        if (plan.risk === 'critical') return 4;
        if (plan.risk === 'high') return 3;
        if (plan.risk === 'medium') return 2;
        return 1;
      }), 1);
      const bRisk = Math.max(...b.plans.map((plan) => {
        if (plan.risk === 'critical') return 4;
        if (plan.risk === 'high') return 3;
        if (plan.risk === 'medium') return 2;
        return 1;
      }), 1);
      return aRisk - bRisk;
    }
    default:
      return Date.parse(a.lastUpdated) - Date.parse(b.lastUpdated);
  }
};

export const applySort = <T extends ContinuityReadinessSurface>(
  values: readonly T[],
  sort: ReadinessSort,
): T[] => {
  const ordered = [...values];
  ordered.sort((left, right) => {
    const raw = comparator(left, right, sort.by);
    return sort.direction === 'asc' ? raw : -raw;
  });
  return ordered;
};

export const filterSurfaces = (
  records: readonly ContinuityReadinessEnvelope[],
  filter: {
    tenantId?: ContinuityReadinessTenantId;
    planId?: ContinuityReadinessPlanId;
    surfaceId?: ContinuityReadinessSurfaceId;
  },
): ContinuityReadinessSurface[] => {
  return records
    .filter((record) => !filter.tenantId || record.tenantId === filter.tenantId)
    .filter((record) => !filter.planId || record.surface.plans.some((plan) => plan.id === filter.planId))
    .filter((record) => !filter.surfaceId || record.surface.id === filter.surfaceId)
    .map((record) => record.surface);
};

export const filterRuns = (
  records: readonly ContinuityReadinessRun[],
  filter: {
    tenantId?: ContinuityReadinessTenantId;
    planId?: ContinuityReadinessPlanId;
    runId?: ContinuityReadinessRunId;
    activeOnly?: boolean;
  },
): ReadinessSearchResult<ContinuityReadinessRun> => {
  let result = [...records];
  if (filter.tenantId) {
    result = result.filter((run) => run.tenantId === filter.tenantId);
  }
  if (filter.planId) {
    result = result.filter((run) => run.planId === filter.planId);
  }
  if (filter.runId) {
    result = result.filter((run) => run.id === filter.runId);
  }
  if (filter.activeOnly) {
    result = result.filter((run) => run.active);
  }

  return {
    rows: result,
    total: result.length,
    page: 1,
    pageSize: Math.max(1, result.length),
  };
};

export const paginate = <T>(rows: readonly T[], page = 1, pageSize = 20): ReadinessSearchResult<T> => {
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safeSize;
  const entries = rows.slice(offset, offset + safeSize);
  return {
    rows: entries,
    total: rows.length,
    page: safePage,
    pageSize: safeSize,
  };
};
