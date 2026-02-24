import type { SyntheticRunRecord, SyntheticRunEvent } from './models';
import { type EventBucket } from './query';

export interface RunHeatmapEntry {
  readonly id: string;
  readonly labels: readonly string[];
  readonly value: number;
}

export interface RunDigest {
  readonly runCount: number;
  readonly activeCount: number;
  readonly failCount: number;
  readonly warningCount: number;
  readonly labels: readonly string[];
}

const isTerminal = (run: SyntheticRunRecord): boolean =>
  run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled';

const toLabel = (run: SyntheticRunRecord): string => `${run.tenantId}/${run.workspaceId}`;

export const buildRunDigest = (runs: readonly SyntheticRunRecord[]): RunDigest => {
  const labels = [...new Set(runs.map(toLabel))];
  const failCount = runs.filter((run) => run.status === 'failed').length;
  const activeCount = runs.filter((run) => !isTerminal(run)).length;
  return {
    runCount: runs.length,
    activeCount,
    failCount,
    warningCount: runs.reduce((acc, run) => acc + run.warnings.length, 0),
    labels,
  };
}

export const buildHeatmap = (events: readonly SyntheticRunEvent[]): readonly RunHeatmapEntry[] => {
  const buckets = new Map<string, number>();
  for (const event of events) {
    const key = `${event.phase}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([phase, value]) => ({
    id: `phase:${phase}`,
    labels: [phase],
    value,
  }));
};

export const topRunSignals = (runs: readonly SyntheticRunRecord[]): readonly string[] => {
  const sorted = [...runs].toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return sorted.slice(0, 10).map((run) => `${run.runId}:${run.status}`);
};

export const summarizeBucketCounts = (buckets: readonly EventBucket[]): string =>
  buckets
    .map((bucket) => `${bucket.pluginId}=${bucket.count}(${bucket.phase})`)
    .join('; ');

export const toTimelineMatrix = (events: readonly SyntheticRunEvent[]): readonly string[] =>
  events.map((event, index) => `${index + 1}:${event.at}:${event.phase}:${event.pluginId}`);
