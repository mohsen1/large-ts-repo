import { PolicyStoreArtifact, PolicyStoreFilters, PolicyStoreRecordMeta, PolicyStoreRunRecord, PolicyStoreSort } from './types';
import { InMemoryPolicyStore } from './store';

export interface PolicyPolicyTimelinePoint {
  readonly key: string;
  readonly value: number;
  readonly unit: 'ms' | 'count';
  readonly labels: Readonly<Record<string, string>>;
}

export interface PolicyEventEnvelope {
  readonly id: string;
  readonly runId: string;
  readonly source: string;
  readonly artifactId: string;
  readonly status: PolicyStoreRunRecord['status'];
  readonly at: string;
}

export interface PolicyTelemetryFrame {
  readonly summary: {
    readonly totalArtifacts: number;
    readonly totalRuns: number;
    readonly activeRatio: number;
  };
  readonly windows: readonly PolicyPolicyTimelinePoint[];
  readonly hotspots: readonly string[];
}

export interface PolicyPolicyArtifact {
  readonly title: string;
  readonly value: number;
}

const normalize = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMetric = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

export class PolicyEventCollector implements AsyncDisposable {
  #artifacts: PolicyStoreArtifact[] = [];
  #runs: PolicyStoreRunRecord[] = [];
  #closed = false;

  public collectArtifact(artifact: PolicyStoreArtifact): void {
    if (!this.#closed) this.#artifacts.push(artifact);
  }

  public collectRun(run: PolicyStoreRunRecord): void {
    if (!this.#closed) this.#runs.push(run);
  }

  public async toFrame(): Promise<PolicyTelemetryFrame> {
    const activeRatio = this.#artifacts.length === 0 ? 0 : Number(this.#artifacts.filter((entry) => entry.state === 'active').length / this.#artifacts.length);
    return {
      summary: {
        totalArtifacts: this.#artifacts.length,
        totalRuns: this.#runs.length,
        activeRatio,
      },
      windows: buildTimeline(this.#runs, 60_000),
      hotspots: [...new Set(this.#runs.map((entry) => entry.actor))],
    };
  }

  public reset(): void {
    this.#artifacts = [];
    this.#runs = [];
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    this.reset();
    await Promise.resolve();
  }
}

const buildTimeline = (runs: readonly PolicyStoreRunRecord[], bucketMs: number): readonly PolicyPolicyTimelinePoint[] => {
  if (runs.length === 0) return [];
  const sorted = [...runs].sort((left, right) => normalize(left.createdAt) - normalize(right.createdAt));
  const first = normalize(sorted[0]?.createdAt ?? new Date().toISOString());
  const last = normalize(sorted[sorted.length - 1]?.createdAt ?? new Date().toISOString());

  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return [];

  const windows: PolicyPolicyTimelinePoint[] = [];
  const step = Math.max(1_000, bucketMs);

  for (let cursor = first; cursor <= last; cursor += step) {
    const to = cursor + step;
    const bucketRuns = sorted.filter((entry) => {
      const value = normalize(entry.createdAt);
      return value >= cursor && value < to;
    });
    const value = bucketRuns.reduce((acc, entry) => acc + parseMetric(entry.metrics?.['elapsedMs']), 0);
    windows.push({
      key: `${new Date(cursor).toISOString()}..${new Date(to).toISOString()}`,
      value,
      unit: 'ms',
      labels: { bucket: String(step), status: bucketRuns.at(-1)?.status ?? 'none' },
    });
  }

  return windows;
};

export const collectStoreTelemetry = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
): Promise<PolicyTelemetryFrame> => {
  const artifacts = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort);
  const runs = await store.searchRuns(orchestratorId);
  const collector = new PolicyEventCollector();
  const stack = new AsyncDisposableStack();
  stack.use(collector);

  for (const artifact of artifacts) collector.collectArtifact(artifact);
  for (const run of runs) collector.collectRun(run);

  try {
    return await collector.toFrame();
  } finally {
    await stack.disposeAsync();
  }
};

export const inspectTimeline = (runs: readonly PolicyStoreRunRecord[], bucketMs = 60_000): readonly PolicyPolicyTimelinePoint[] =>
  buildTimeline(runs, bucketMs);

export const collectStoreEvents = async function* (
  store: InMemoryPolicyStore,
  filters: PolicyStoreFilters,
): AsyncGenerator<PolicyEventEnvelope> {
  const artifacts = await store.searchArtifacts(filters, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort);
  for (const artifact of artifacts) {
    yield {
      id: artifact.id,
      runId: artifact.artifactId,
      source: artifact.namespace,
      artifactId: artifact.artifactId,
      status: 'running',
      at: artifact.updatedAt,
    };
  }

  const runs = await store.searchRuns(filters.orchestratorId ?? '');
  for (const run of runs) {
    yield {
      id: run.id,
      runId: run.runId,
      source: run.actor,
      artifactId: run.planId,
      status: run.status,
      at: run.updatedAt,
    };
  }
};

export const windowRunEvents = (
  runs: readonly PolicyStoreRunRecord[],
  bucketMs = 60_000,
): readonly PolicyPolicyTimelinePoint[] =>
  buildTimeline(runs.map((run) => ({ ...run, createdAt: run.createdAt })), bucketMs);

export const collectEventPayload = (
  records: readonly PolicyStoreRecordMeta[],
  runId: string,
): readonly PolicyPolicyArtifact[] =>
  records.map((record, index) => ({
    title: `${record.id}:${index}`,
    value: normalize(record.updatedAt) + normalize(record.createdAt),
  }));
