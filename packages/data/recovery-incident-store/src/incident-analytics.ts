import type {
  IncidentRecord,
  IncidentEvent,
  IncidentId,
} from '@domain/recovery-incident-orchestration';
import type {
  IncidentStoreState,
  IncidentRunRecord,
  QueryResult,
  IncidentStoreEvent,
  IncidentPlanRecord,
} from './types';
import { buildAggregate } from './queries';

export interface TimeSeriesPoint {
  readonly timestamp: string;
  readonly value: number;
}

export interface SeverityForecast {
  readonly tenantId: string;
  readonly predictedRisk: number;
  readonly confidence: number;
  readonly drivers: readonly string[];
}

export interface IncidentTrend {
  readonly key: string;
  readonly total: number;
  readonly resolved: number;
  readonly escalationCount: number;
  readonly averageSignals: number;
}

export interface StoreAnalytics {
  readonly byTenant: Record<string, number>;
  readonly bySeverity: Record<IncidentRecord['severity'], number>;
  readonly runHealthTrend: readonly TimeSeriesPoint[];
  readonly eventDistribution: Readonly<Record<string, number>>;
}

export interface IncidentEventBucket {
  readonly eventType: IncidentEvent['type'];
  readonly eventCount: number;
}

export interface IncidentPlanStat {
  readonly incidentId: IncidentId;
  readonly planId: string;
  readonly riskScore: number;
  readonly isApproved: boolean;
}

export interface EventPressure {
  readonly incidentId: string;
  readonly terminalCount: number;
}

const clamp = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

export const summarizeRunHealth = (runs: readonly IncidentRunRecord[]): {
  readonly done: number;
  readonly failed: number;
  readonly running: number;
  readonly pending: number;
  readonly healthScore: number;
} => {
  const totals = {
    done: 0,
    failed: 0,
    running: 0,
    pending: 0,
  };

  for (const record of runs) {
    if (record.status === 'done') {
      totals.done += 1;
      continue;
    }
    if (record.status === 'failed') {
      totals.failed += 1;
      continue;
    }
    if (record.status === 'running') {
      totals.running += 1;
      continue;
    }
    totals.pending += 1;
  }

  const base = runs.length || 1;
  const healthScore = (totals.done + totals.running) / base;
  return {
    ...totals,
    healthScore: clamp(Number(healthScore.toFixed(4))),
  };
};

export const bucketEvents = (events: readonly IncidentStoreEvent[]): readonly IncidentEventBucket[] => {
  const buckets = new Map<IncidentStoreEvent['type'], number>();
  for (const event of events) {
    buckets.set(event.type, (buckets.get(event.type) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([eventType, eventCount]) => ({ eventType, eventCount }))
    .sort((left, right) => right.eventCount - left.eventCount);
};

export const buildStoreAnalytics = (state: IncidentStoreState): StoreAnalytics => {
  const aggregate = buildAggregate(state.incidents.map((entry) => entry.incident));
  const runHealthTrend: TimeSeriesPoint[] = [
    ...state.runs.map((run, index) => ({
      timestamp: run.run.startedAt,
      value: run.status === 'failed' ? 0 : run.status === 'done' ? 1 : 0.6,
    })),
    {
      timestamp: new Date().toISOString(),
      value: summarizeRunHealth(state.runs).healthScore,
    },
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  const eventDistribution = bucketEvents(state.events).reduce<Record<string, number>>((acc, bucket) => {
    acc[bucket.eventType] = bucket.eventCount;
    return acc;
  }, {});

  return {
    byTenant: aggregate.byTenant,
    bySeverity: aggregate.bySeverity,
    runHealthTrend: runHealthTrend.slice(0, 120),
    eventDistribution,
  };
};

export const buildSeverityForecast = (
  incidents: readonly IncidentRecord[],
  tenantId: string,
): SeverityForecast => {
  const tenantIncidents = incidents.filter((incident) => incident.scope.tenantId === tenantId);
  const unresolved = tenantIncidents.filter((incident) => !incident.resolvedAt);
  const highRisk = unresolved.filter((incident) => incident.severity === 'high' || incident.severity === 'critical' || incident.severity === 'extreme');

  const predictedRisk = unresolved.length === 0 ? 0 : highRisk.length / unresolved.length;
  const avgSignal = unresolved.reduce((total, incident) => total + incident.signals.length, 0) / Math.max(1, unresolved.length);

  return {
    tenantId,
    predictedRisk: Number(predictedRisk.toFixed(4)),
    confidence: Number((0.45 + clamp(avgSignal / 50)).toFixed(4)),
    drivers: [`unresolved=${unresolved.length}`, `signals=${avgSignal.toFixed(1)}`],
  };
};

export const buildIncidentTrend = (query: QueryResult<IncidentRecord>): readonly IncidentTrend[] => {
  const { total, data } = query;
  const unresolved = data.filter((incident) => !incident.resolvedAt).length;
  const escalationCount = data.filter((incident) => incident.severity === 'critical' || incident.severity === 'extreme').length;
  const averageSignals = data.reduce((acc, incident) => acc + incident.signals.length, 0) / Math.max(1, data.length);

  return [
    {
      key: query.total > 0 ? `tenant:${query.data.at(0)?.scope.tenantId ?? 'global'}` : 'tenant:global',
      total,
      resolved: total - unresolved,
      escalationCount,
      averageSignals: Number(averageSignals.toFixed(4)),
    },
  ];
};

export const collectIncidentPlanStats = (plans: readonly IncidentPlanRecord[]): readonly IncidentPlanStat[] =>
  plans.map((plan) => ({
    incidentId: plan.incidentId,
    planId: String(plan.id),
    riskScore: plan.plan.riskScore,
    isApproved: plan.plan.approved,
  }));

export const summarizeEventPressure = (
  plans: readonly IncidentPlanRecord[],
): readonly EventPressure[] => {
  const planCounts = new Map<string, number>();
  for (const plan of plans) {
    const key = String(plan.incidentId);
    planCounts.set(key, (planCounts.get(key) ?? 0) + 1);
  }
  return [...planCounts.entries()].map(([incidentId, terminalCount]) => ({ incidentId, terminalCount }));
};
