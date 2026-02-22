import type { IncidentRecord, IncidentPlan, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { IncidentStoreState, IncidentStoreEvent, IncidentStoreEvent as EventRecord } from './types';
import { buildIncidentRollups, buildAggregate } from './queries';
import type { IncidentRollup, IncidentAggregate } from './queries';
import type { IncidentPlanRecord } from './types';

export interface ReadinessBucket {
  readonly at: string;
  readonly criticality: number;
  readonly runCount: number;
  readonly incidentCount: number;
  readonly resolved: number;
}

export interface ReadinessSeries {
  readonly tenantId: string;
  readonly buckets: readonly ReadinessBucket[];
  readonly totals: {
    readonly bucketSizeMinutes: number;
    readonly sampleCount: number;
  };
}

interface EnrichedIncident {
  readonly incident: IncidentRecord;
  readonly plans: readonly IncidentPlan[];
  readonly runs: readonly OrchestrationRun[];
}

const toMinutes = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.floor(parsed / 60_000);
};

const safeNum = (value: number): number => (Number.isFinite(value) ? value : 0);

const bucketFor = (value: string, sizeMinutes: number): number => {
  const now = Date.now();
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return now;
  }
  const bucketSpan = sizeMinutes * 60_000;
  return Math.floor(at / bucketSpan) * bucketSpan;
};

const enrich = (state: IncidentStoreState): readonly EnrichedIncident[] => {
  const planByIncident = new Map<string, IncidentPlan[]>();
  for (const plan of state.plans) {
    const list = planByIncident.get(String(plan.incidentId)) ?? [];
    list.push(plan.plan);
    planByIncident.set(String(plan.incidentId), list);
  }

  const runByIncident = new Map<string, OrchestrationRun[]>();
  for (const plan of state.runs) {
    const list = runByIncident.get(String(plan.run.planId)) ?? [];
    list.push(plan.run);
    runByIncident.set(String(plan.run.planId), list);
  }

  return state.incidents.map(({ incident }) => ({
    incident,
    plans: planByIncident.get(String(incident.id)) ?? [],
    runs: runByIncident.get(String(incident.id)) ?? [],
  }));
};

export const buildReadinessSeries = (
  state: IncidentStoreState,
  bucketSizeMinutes: number,
): ReadinessSeries => {
  const byTenant = new Map<string, ReadinessBucket[]>();
  const enriched = enrich(state);
  const rollups = buildIncidentRollups(
    state.incidents.map((entry) => entry.incident),
    state.plans as unknown as readonly IncidentPlanRecord[],
    state.runs,
    state.events,
  );
  const bucketMap = new Map<number, { incidentCount: number; runCount: number; criticality: number; resolved: number }>();

  for (const item of enriched) {
    const tenant = item.incident.scope.tenantId;
    const rolls = rollups.find((entry) => entry.incidentId === item.incident.id) as IncidentRollup | undefined;
    const baseMinutes = bucketFor(item.incident.detectedAt, bucketSizeMinutes);

    const bucketKey = baseMinutes;
    const existing = bucketMap.get(bucketKey);
    if (existing) {
      existing.incidentCount += 1;
      existing.runCount += item.runs.length;
      existing.criticality += item.incident.signals.length;
      existing.resolved += item.incident.resolvedAt ? 1 : 0;
    } else {
      bucketMap.set(bucketKey, {
        incidentCount: 1,
        runCount: item.runs.length,
        criticality: item.incident.signals.length + (rolls?.runCount ?? 0),
        resolved: item.incident.resolvedAt ? 1 : 0,
      });
    }
    if (!byTenant.has(tenant)) {
      byTenant.set(tenant, []);
    }
  }

  const buckets: ReadinessBucket[] = [...bucketMap.entries()].map(([at, info]) => ({
    at: new Date(at).toISOString(),
    criticality: Number((info.criticality / Math.max(1, info.incidentCount)).toFixed(4)),
    runCount: info.runCount,
    incidentCount: info.incidentCount,
    resolved: info.resolved,
  })).sort((left, right) => left.at.localeCompare(right.at));

  const bucketSize = Math.max(5, bucketSizeMinutes);
  return {
    tenantId: byTenant.size > 0 ? [...byTenant.keys()][0] : 'global',
    buckets,
    totals: {
      bucketSizeMinutes: bucketSize,
      sampleCount: buckets.length,
    },
  };
};

export const buildPortfolioReadiness = (state: IncidentStoreState): {
  readonly tenantCount: number;
  readonly incidentCount: number;
  readonly eventCount: number;
  readonly topSeverity: Readonly<Record<string, number>>;
  readonly recentResolvedTrend: ReadonlyArray<number>;
  readonly riskByTenant: Readonly<Record<string, number>>;
} => {
  const incidents = state.incidents.map((entry) => entry.incident);
  const aggregate = buildAggregate(incidents);
  const topSeverity = aggregate.bySeverity;
  const riskByTenant: Record<string, number> = {};
  for (const event of state.events) {
    const tenantId = event.payload.tenantId as string | undefined;
    if (!tenantId) {
      continue;
    }
    riskByTenant[tenantId] = (riskByTenant[tenantId] ?? 0) + 1;
  }
  const sortedRisk = Object.entries(riskByTenant).sort((left, right) => right[1] - left[1]);
  const riskByTenantSorted = Object.fromEntries(sortedRisk) as Readonly<Record<string, number>>;

  const recentResolvedTrend = incidents
    .slice(-20)
    .map((incident) => incident.resolvedAt ? safeNum(toMinutes(incident.resolvedAt)) : 0);

  return {
    tenantCount: Object.keys(aggregate.byTenant).length,
    incidentCount: incidents.length,
    eventCount: state.events.length,
    topSeverity,
    recentResolvedTrend,
    riskByTenant: riskByTenantSorted,
  };
};

export const filterEventsByTenant = (events: readonly IncidentStoreEvent[], tenantId: string): EventRecord[] =>
  events.filter((event) => event.payload.tenantId === tenantId);

export const buildResolutionVelocity = (state: IncidentStoreState, tenantId: string): ReadonlyArray<{ minute: number; cumulativeResolved: number }> => {
  const incidents = state.incidents.filter((entry) => entry.incident.scope.tenantId === tenantId).map((entry) => entry.incident);
  const byMinute = new Map<number, number>();
  let cumulative = 0;
  for (const incident of incidents) {
    if (!incident.resolvedAt) {
      continue;
    }
    const minute = toMinutes(incident.resolvedAt);
    byMinute.set(minute, (byMinute.get(minute) ?? 0) + 1);
  }

  const ordered = [...byMinute.entries()].sort((left, right) => left[0] - right[0]);
  return ordered.map(([minute, delta]) => {
    cumulative += delta;
    return { minute, cumulativeResolved: cumulative };
  });
};
