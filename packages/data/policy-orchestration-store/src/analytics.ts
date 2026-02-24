import { NoInfer } from '@shared/type-level';
import {
  PolicyStoreArtifact,
  PolicyStoreRecordMeta,
  PolicyStoreRunRecord,
  PolicyStoreFilters,
  PolicyStoreSort,
} from './types';
import { InMemoryPolicyStore } from './store';
import { summarizeArtifacts, summarizeRuns } from './metrics';

export interface ArtifactStateBuckets {
  readonly states: Record<'active' | 'archived' | 'retired', number>;
  readonly total: number;
}

export interface TimelinePoint {
  readonly key: string;
  readonly value: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface RunHealthSummary {
  readonly totalRuns: number;
  readonly successRate: number;
  readonly medianDurationMs: number;
  readonly p95DurationMs: number;
}

export interface WindowRange {
  readonly from: string;
  readonly to: string;
}

export interface StoreTelemetryFrame {
  readonly artifactCount: ArtifactStateBuckets;
  readonly timeline: readonly TimelinePoint[];
  readonly runHealth: RunHealthSummary;
}

export interface ArtifactWindowSelector<TRecords extends readonly PolicyStoreRecordMeta[]> {
  readonly window: WindowRange;
  readonly records: TRecords;
}

type ArtifactGroups = {
  active: PolicyStoreArtifact[];
  archived: PolicyStoreArtifact[];
  retired: PolicyStoreArtifact[];
};

export interface StoreMetricLine {
  readonly id: string;
  readonly value: number;
  readonly unit: 'ms' | 'count';
}

const normalizeTime = (input: string): number => {
  const value = new Date(input).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const makeBuckets = (artifacts: readonly PolicyStoreArtifact[]): ArtifactStateBuckets => {
  const states: Record<'active' | 'archived' | 'retired', number> = {
    active: 0,
    archived: 0,
    retired: 0,
  };

  for (const artifact of artifacts) {
    states[artifact.state] += 1;
  }

  return {
    states,
    total: artifacts.length,
  };
};

export const groupArtifactsByState = (artifacts: readonly PolicyStoreArtifact[]): ArtifactGroups => {
  const buckets: ArtifactGroups = {
    active: [],
    archived: [],
    retired: [],
  };

  for (const artifact of artifacts) {
    buckets[artifact.state].push(artifact);
  }
  return buckets;
};

export const paginateByUpdatedAt = async (
  items: readonly PolicyStoreArtifact[],
  windowMs: number,
): Promise<ArtifactWindowSelector<PolicyStoreArtifact[]>> => {
  if (items.length === 0) {
    return {
      window: {
        from: new Date(0).toISOString(),
        to: new Date(0).toISOString(),
      },
      records: [],
    };
  }

  const ordered = [...items].sort((left, right) => normalizeTime(right.updatedAt) - normalizeTime(left.updatedAt));
  const latest = normalizeTime(ordered[0]?.updatedAt ?? new Date().toISOString());
  const threshold = latest - windowMs;
  const records = ordered.filter((entry) => normalizeTime(entry.updatedAt) >= threshold);
  return {
    window: {
      from: new Date(threshold).toISOString(),
      to: new Date(latest).toISOString(),
    },
    records,
  };
};

export const buildTimeline = (
  records: readonly PolicyStoreArtifact[],
  stepMs = 60_000,
): readonly TimelinePoint[] => {
  if (records.length === 0) {
    return [];
  }

  const normalized = [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const start = normalizeTime(normalized[0]?.createdAt ?? new Date().toISOString());
  const end = normalizeTime(normalized[normalized.length - 1]?.createdAt ?? new Date().toISOString());
  const buckets = new Map<number, number>();

  for (let cursor = start; cursor <= end; cursor += stepMs) {
    buckets.set(cursor, 0);
  }

  for (const item of normalized) {
    const created = normalizeTime(item.createdAt);
    const bucket = Math.floor((created - start) / stepMs) * stepMs + start;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([key, value]) => ({
    key: new Date(key).toISOString(),
    value,
    metadata: {
      bucket: String(stepMs),
      source: 'policy-store',
    },
  }));
};

export const collectRunHealth = (runs: readonly PolicyStoreRunRecord[]): RunHealthSummary => {
  const totalRuns = runs.length;
  if (totalRuns === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      medianDurationMs: 0,
      p95DurationMs: 0,
    };
  }

  const successful = runs.filter((run) => run.status === 'succeeded');
  const durations = runs
    .map((run) => Number(run.metrics?.['elapsedMs']))
    .filter((entry) => Number.isFinite(entry))
    .sort((left, right) => left - right);

  const successRate = (successful.length / runs.length) * 100;
  const medianDurationMs = durations.length === 0 ? 0 : durations[Math.floor((durations.length - 1) * 0.5)] ?? 0;
  const p95DurationMs = durations.length === 0 ? 0 : durations[Math.floor((durations.length - 1) * 0.95)] ?? 0;
  return {
    totalRuns,
    successRate,
    medianDurationMs,
    p95DurationMs,
  };
};

export const summarizeStore = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
): Promise<StoreTelemetryFrame> => {
  const artifacts = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort);
  const runs = await store.searchRuns(orchestratorId);
  const plans = await store.plan.listByOrchestrator(orchestratorId);
  const groupedArtifacts = groupArtifactsByState(artifacts);
  const timeline = buildTimeline(artifacts);
  const runHealth = collectRunHealth(runs);
  const artifactCount = {
    states: {
      active: groupedArtifacts.active.length,
      archived: groupedArtifacts.archived.length,
      retired: groupedArtifacts.retired.length,
    },
    total: artifacts.length,
  };

  return {
    artifactCount,
    timeline,
    runHealth,
  };
};

export const filterByWindow = async <T extends PolicyStoreRecordMeta>(
  records: readonly T[],
  windowMs = 3600_000,
): Promise<ArtifactWindowSelector<readonly T[]>> => {
  const normalized = [...records].sort((left, right) => normalizeTime(right.createdAt) - normalizeTime(left.createdAt));
  const latest = normalizeTime(normalized[0]?.createdAt ?? new Date(0).toISOString());
  const selected = records.filter((entry) => normalizeTime(entry.createdAt) >= latest - windowMs);

  return {
    window: {
      from: new Date(latest - windowMs).toISOString(),
      to: new Date(latest).toISOString(),
    },
    records: selected,
  };
};

export const rankArtifactsByWindow = async (
  store: InMemoryPolicyStore,
  filters: PolicyStoreFilters,
): Promise<ArtifactWindowSelector<PolicyStoreArtifact[]>> => {
  const artifacts = await store.searchArtifacts(filters);
  return paginateByUpdatedAt(artifacts, 120 * 60_000);
};

export const summarizeStoreMetrics = (
  artifacts: readonly PolicyStoreArtifact[],
  runs: readonly PolicyStoreRunRecord[],
): ReadonlyArray<StoreMetricLine> => {
  const artifactSummary = summarizeArtifacts(artifacts);
  const runSummary = summarizeRuns(runs);
  const totalWindowMs = runs.reduce<number>((acc, run) => {
    const elapsed = Number(run.metrics?.['elapsedMs']);
    return acc + (Number.isFinite(elapsed) ? elapsed : 0);
  }, 0);
  return [
    { id: 'artifact.total', value: artifactSummary.totalArtifacts, unit: 'count' },
    { id: 'artifact.active', value: artifactSummary.activeArtifacts, unit: 'count' },
    { id: 'run.success', value: runSummary.runRateSuccess, unit: 'count' },
    { id: 'run.elapsed', value: totalWindowMs, unit: 'ms' },
  ];
};

export const summarizeByOrchestrator = async (store: InMemoryPolicyStore, orchestratorId: string) => {
  const runHistory = await store.searchRuns(orchestratorId);
  const runLog = runHistory
    .toSorted((left, right) => normalizeTime(right.updatedAt) - normalizeTime(left.updatedAt))
    .slice(0, 20)
    .map((entry) => `${entry.id}:${entry.status}`);

  const runMap = new Map<string, number>();
  for (const entry of runLog) {
    const [id] = entry.split(':');
    runMap.set(id, (runMap.get(id) ?? 0) + 1);
  }
  return {
    runMap,
    runLog,
  };
};

export const filterByOrchestrator = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
): Promise<readonly PolicyStoreArtifact[]> => {
  const sorted = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' });
  return sorted;
};

export const topArtifactsByNamespace = (
  artifacts: readonly PolicyStoreArtifact[],
  top = 3,
): Record<string, number> =>
  artifacts
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, top)
    .reduce<Record<string, number>>((acc, artifact) => {
      acc[artifact.namespace] = (acc[artifact.namespace] ?? 0) + artifact.revision;
      return acc;
    }, {});

export const buildPathAwareSummary = <TRecord extends Record<string, unknown>>(record: NoInfer<TRecord>) => {
  const keys = Object.keys(record) as Array<keyof TRecord>;
  return keys.map((key) => String(key));
};
