import { asTenantId, asRouteId, type LatticeTenantId } from '@domain/recovery-lattice';
import {
  collectBlueprintMetrics,
  createCollector,
  makeMetricId,
  metricSummary,
  type LatticeMetricSample,
} from '@domain/recovery-lattice';
import type {
  LatticeOrchestratorEvent,
  LatticeOrchestratorResult,
  LatticeOrchestratorMode,
  LatticeSessionHandle,
} from './types';
import type {
  LatticeStoreEvent,
  LatticeStoreQuery,
  LatticeStoreResult,
  LatticeSnapshotRecord,
} from '@data/recovery-lattice-orchestrator-store';

export type InsightSignal = 'stable' | 'warning' | 'degraded' | 'offline';

export interface InsightCell {
  readonly id: string;
  readonly tenantId: LatticeTenantId;
  readonly key: string;
  readonly value: number;
  readonly unit: string;
}

export interface LatticeInsight {
  readonly tenantId: LatticeTenantId;
  readonly signal: InsightSignal;
  readonly total: number;
  readonly cells: readonly InsightCell[];
  readonly events: readonly string[];
  readonly at: string;
}

export type InsightFilter = {
  readonly tenantId?: LatticeTenantId;
  readonly routes?: readonly string[];
  readonly includeWarnings?: boolean;
};

export interface MetricCard {
  readonly routeId: string;
  readonly metric: string;
  readonly count: number;
  readonly signature: string;
}

type WindowMap<TContext extends object> = {
  readonly byRoute: Readonly<Record<string, number>>;
  readonly byTenant: Readonly<Record<string, number>>;
  readonly samples: readonly LatticeMetricSample<TContext>[];
};

const defaultWindowCap = 1000;

const makeCellKey = (tenantId: LatticeTenantId, key: string): string =>
  `${tenantId}:${key}`;

const isHealthy = (value: number, total: number): boolean => total > 0 && value / total >= 0.9;

const normalizeSamples = <TContext extends object>(
  samples: Iterable<LatticeMetricSample<TContext>>,
): readonly LatticeMetricSample<TContext>[] =>
  [...(samples as Iterable<LatticeMetricSample<TContext>>)].toSorted((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );

const buildFingerprint = <TContext extends Record<string, unknown>>(
  samples: readonly LatticeMetricSample<TContext>[],
): string =>
  samples
    .map((sample) => `${sample.name}-${sample.unit}-${sample.severity}`)
    .toSorted()
    .join('|');

const asSignal = (errors: number, total: number): InsightSignal => {
  if (total === 0) return 'offline';
  if (errors === 0) return 'stable';
  if (errors < Math.floor(total * 0.2)) return 'warning';
  return 'degraded';
};

export const foldWindowMap = <TContext extends Record<string, unknown>>(
  samples: Iterable<LatticeMetricSample<TContext>>,
): WindowMap<TContext> => {
  const byRoute = new Map<string, number>();
  const byTenant = new Map<string, number>();
  const grouped: LatticeMetricSample<TContext>[] = [];

  for (const sample of samples) {
    const route = sample.name;
    byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
    byTenant.set(String(sample.tenantId), (byTenant.get(String(sample.tenantId)) ?? 0) + 1);
    grouped.push(sample);
  }

  return {
    byRoute: Object.fromEntries(byRoute) as Readonly<Record<string, number>>,
    byTenant: Object.fromEntries(byTenant) as Readonly<Record<string, number>>,
    samples: grouped,
  };
};

export const summarizeSession = (handles: readonly LatticeSessionHandle[]): string[] =>
  handles
    .toSorted((left, right) => right.state.context.requestId.localeCompare(left.state.context.requestId))
    .map((handle) => `${handle.id}:${handle.state.status}`);

export const makeMetricCards = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  samples: readonly LatticeMetricSample<TContext>[],
  limit = 25,
): readonly MetricCard[] =>
  Object.entries(foldWindowMap(samples).byRoute)
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([route, total]) => ({
      routeId: route,
      metric: `metric:${tenantId}:${route}`,
      count: total,
      signature: `${tenantId}:${route}:${total}`,
    }));

export const buildInsight = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  samples: Iterable<LatticeMetricSample<TContext>>,
  events: readonly LatticeOrchestratorEvent[],
  filter: InsightFilter = {},
): LatticeInsight => {
  const folded = foldWindowMap(samples);
  const filteredSamples = filter.tenantId
    ? folded.samples.filter((entry) => entry.tenantId === filter.tenantId)
    : folded.samples;
  const errors = filteredSamples.filter((entry) => entry.severity === 'critical' || entry.severity === 'warning').length;
  const total = filteredSamples.length;

  const cells = Object.entries(folded.byRoute).map(([key, value]) => ({
    id: makeCellKey(tenantId, key),
    tenantId,
    key,
    value,
    unit: 'samples',
  }));

  const routeEvents = filter.routes
    ? events.filter((event) => filter.routes?.some((route) => event.details['route'] === route))
    : events;

  const visible = filter.includeWarnings ? routeEvents : routeEvents.slice(0, defaultWindowCap);
  return {
    tenantId,
    signal: asSignal(errors, total),
    total,
    cells,
    events: visible.map((event) => `${event.type}:${event.id}`),
    at: new Date().toISOString(),
  };
};

export const buildSignalSummary = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  samples: readonly LatticeMetricSample<TContext>[],
): string => {
  const fingerprint = buildFingerprint(samples);
  return `${tenantId}:${samples.length}:${fingerprint.length}`;
};

export const collectRouteInsights = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  routes: readonly string[],
  samples: Iterable<LatticeMetricSample<TContext>>,
): Readonly<Record<string, number>> => {
  const map = new Map<string, number>();
  for (const sample of samples) {
    if (routes.length > 0 && !routes.includes(sample.name)) {
      continue;
    }
    map.set(sample.name, (map.get(sample.name) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()].toSorted((left, right) => right[1] - left[1]));
};

export const scoreResult = (result: LatticeOrchestratorResult): number => {
  if (result.status === 'completed') return 1;
  if (result.status === 'running') return 0.7;
  if (result.status === 'aborted') return 0.2;
  return 0;
};

export const aggregateResultSignals = (results: readonly LatticeOrchestratorResult[]): number =>
  results.reduce((acc, result) => acc + scoreResult(result), 0) / Math.max(1, results.length);

export const summarizeMetricSamples = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  samples: readonly LatticeMetricSample<TContext>[],
): readonly LatticeMetricSample<TContext>[] => {
  const collector = createCollector<TContext>(
    tenantId,
    String(asRouteId(`route:${tenantId}`)),
    makeMetricId(tenantId, `summary:${tenantId}`),
    {
      maxSamples: 32,
      windowMs: 30_000,
      thresholds: [10, 20, 50],
    },
  );
  for (const sample of samples) {
    collector.record(sample);
  }
  const window = collector.snapshot((entry) => entry.tenantId === tenantId);
  const tuple: readonly LatticeMetricSample<TContext>[] = window.samples.map((entry) => ({
    ...entry,
    value: Number.isFinite(entry.value) ? entry.value : 0,
  }));
  return tuple;
};

export const summarizeSnapshotStore = <TRecord extends LatticeSnapshotRecord>(
  records: readonly TRecord[],
): Readonly<Record<string, number>> => {
  const buckets = new Map<string, number>();
  for (const record of records) {
    for (const event of record.events) {
      buckets.set(event.kind, (buckets.get(event.kind) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...buckets.entries()]);
};

export const buildEventDigest = (events: readonly LatticeStoreEvent[]): string =>
  events
    .toSorted((left, right) => right.at.localeCompare(left.at))
    .map((event) => `${event.kind}:${event.kind}:${event.at}`)
    .join('|');

export const summarizeStoreResult = <T extends LatticeSnapshotRecord>(
  result: LatticeStoreResult<T>,
  query: LatticeStoreQuery,
): LatticeInsight => {
  const tenant = query.tenantId ? asTenantId(query.tenantId) : asTenantId('tenant:default');
  return {
    tenantId: tenant,
    signal: result.total > 0 ? 'stable' : 'offline',
    total: result.total,
    cells: result.records.map((record) => ({
      id: `${tenant}:${record.id}`,
      tenantId: tenant,
      key: record.id,
      value: record.events.length,
      unit: 'events',
    })),
    events: [JSON.stringify(query)],
    at: new Date().toISOString(),
  };
};

export const routeSamplesToInsights = <TContext extends Record<string, unknown>>(
  tenantId: LatticeTenantId,
  routeId: string,
  samples: Iterable<LatticeMetricSample<TContext>>,
): LatticeInsight => buildInsight(tenantId, normalizeSamples(samples), [], { tenantId, routes: [routeId] });

export const runMode = (mode: LatticeOrchestratorMode): string => mode.toUpperCase();
