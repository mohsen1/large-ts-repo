import {
  type Brand,
  type HorizonIdentity,
  type HorizonSnapshot,
  type HorizonTemplate,
  type HorizonWorkspaceId,
  type StageChain,
  type HorizonMetric,
  type HorizonArtifactId,
  defaultStages,
  type HorizonStage,
} from '@domain/recovery-stress-lab';
import { err, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';

export interface ProjectionBucketOptions {
  readonly includeSignals?: boolean;
  readonly includeArtifacts?: boolean;
  readonly windowMinutes?: number;
}

export interface ProjectionBucket {
  readonly bucket: Brand<string, 'ProjectionBucket'>;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly metrics: readonly HorizonMetric[];
  readonly artifacts: readonly HorizonArtifactId[];
  readonly severity: ProjectionSeverity;
}

type ProjectionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface HorizonProjectionEnvelope {
  readonly identity: HorizonIdentity;
  readonly workspaceId: HorizonWorkspaceId;
  readonly template: HorizonTemplate;
  readonly snapshot: HorizonSnapshot;
  readonly stageRoute: StageChain<typeof defaultStages>;
  readonly metrics: readonly HorizonMetric[];
}

export interface ProjectionStoreState {
  readonly buckets: number;
  readonly snapshots: number;
  readonly artifacts: number;
  readonly route: StageChain;
}

export interface ProjectionSnapshotQuery {
  readonly workspaceId: HorizonWorkspaceId;
  readonly from: string;
  readonly to: string;
  readonly template?: Brand<string, 'HorizonTemplateId'>;
}

export interface ProjectionTimelinePoint {
  readonly id: Brand<string, 'ProjectionPoint'>;
  readonly key: string;
  readonly at: string;
  readonly values: readonly number[];
  readonly severity: ProjectionSeverity;
}

export interface ProjectionStoreRepository {
  appendSnapshot(envelope: HorizonProjectionEnvelope): Promise<Result<void>>;
  listWorkspaceSnapshots(workspaceId: HorizonWorkspaceId): Promise<Result<readonly HorizonProjectionEnvelope[]>>;
  listBuckets(workspaceId: HorizonWorkspaceId): Promise<Result<readonly ProjectionBucket[]>>;
  queryTimeline(query: ProjectionSnapshotQuery): Promise<Result<readonly ProjectionTimelinePoint[]>>;
  prune(olderThan: string): Promise<Result<number>>;
}

const fail = <T>(error: string): Result<T> => ({ ok: false, error: new Error(error) });
const success = <T>(value: T): Result<T> => ({ ok: true, value });

const toBuckets = (
  snapshots: readonly HorizonSnapshot[],
  stageRoute: StageChain,
  options: ProjectionBucketOptions,
): readonly ProjectionBucket[] => {
  const bucketMap = new Map<string, HorizonSnapshot[]>();
  for (const snapshot of snapshots) {
    const minute = snapshot.timestamp.slice(0, 16);
    const existing = bucketMap.get(minute);
    if (!existing) {
      bucketMap.set(minute, [snapshot]);
      continue;
    }
    existing.push(snapshot);
  }

  return [...bucketMap.entries()].map(([bucket, entries], index) => {
    const metrics = entries.flatMap((snapshot) => snapshot.metrics);
    const window = options.windowMinutes ?? 5;
    const severity = index % 11 === 0
      ? 'critical'
      : index % 5 === 0
        ? 'high'
        : index % 3 === 0
          ? 'medium'
          : 'low';
    const values = metrics.map((metric) => metric.score);
    const max = values.length === 0 ? 0 : values.reduce((acc, value) => (acc > value ? acc : value), values[0]);
    const bucketWindow = Math.max(0, window - (index % window));
    return {
      bucket: `bucket-${bucket}:${bucketWindow}` as Brand<string, 'ProjectionBucket'>,
      startedAt: `${bucket}:00.000Z`,
      endedAt: `${bucket}:59.999Z`,
      metrics: options.includeSignals ? metrics : metrics.slice(0, 0),
      artifacts: options.includeArtifacts ? entries.map((entry) => entry.artifactId) : [],
      severity: (max >= 80 ? 'critical' : max >= 55 ? 'high' : max >= 35 ? 'medium' : 'low') as ProjectionSeverity,
    };
  });
};

export class HorizonIncidentProjectionStore implements ProjectionStoreRepository {
  readonly #identityBuckets = new Map<HorizonWorkspaceId, Map<string, HorizonProjectionEnvelope[]>>();
  readonly #artifactBuckets = new Map<HorizonArtifactId, HorizonProjectionEnvelope[]>();
  readonly #defaultRoute: StageChain<typeof defaultStages>;

  constructor(defaultRoute: StageChain<typeof defaultStages> = ('sense/assess/plan/simulate/approve/execute/verify/close' as StageChain<typeof defaultStages>)) {
    this.#defaultRoute = defaultRoute;
  }

  async appendSnapshot(envelope: HorizonProjectionEnvelope): Promise<Result<void>> {
    const existing = this.#identityBuckets.get(envelope.workspaceId) ?? new Map<string, HorizonProjectionEnvelope[]>();
    const current = existing.get(envelope.identity.trace) ?? [];
    existing.set(
      envelope.identity.trace,
      [...current, envelope].toSorted((left, right) => left.snapshot.timestamp.localeCompare(right.snapshot.timestamp)),
    );
    this.#identityBuckets.set(envelope.workspaceId, existing);

    const artifactBucket = this.#artifactBuckets.get(envelope.snapshot.artifactId) ?? [];
    this.#artifactBuckets.set(
      envelope.snapshot.artifactId,
      [...artifactBucket, envelope].toSorted((left, right) => left.snapshot.timestamp.localeCompare(right.snapshot.timestamp)),
    );
    return success(undefined);
  }

  async listWorkspaceSnapshots(workspaceId: HorizonWorkspaceId): Promise<Result<readonly HorizonProjectionEnvelope[]>> {
    const workspace = this.#identityBuckets.get(workspaceId);
    if (!workspace) {
      return success([]);
    }

    const snapshots = [...workspace.values()].flatMap((bucket) => bucket);
    return success(
      snapshots.toSorted((left, right) => right.snapshot.timestamp.localeCompare(left.snapshot.timestamp)),
    );
  }

  async listBuckets(workspaceId: HorizonWorkspaceId): Promise<Result<readonly ProjectionBucket[]>> {
    const workspace = this.#identityBuckets.get(workspaceId);
    if (!workspace) {
      return success([]);
    }

    const snapshots = [...workspace.values()].flatMap((items) => items).map((item) => item.snapshot);
    const buckets = toBuckets(
      snapshots,
      this.#defaultRoute,
      { includeSignals: true, includeArtifacts: true, windowMinutes: 5 },
    );
    return success(buckets);
  }

  async queryTimeline(query: ProjectionSnapshotQuery): Promise<Result<readonly ProjectionTimelinePoint[]>> {
    const workspace = this.#identityBuckets.get(query.workspaceId);
    if (!workspace) {
      return success([]);
    }

    const snapshots = [...workspace.values()]
      .flatMap((items) => items)
      .filter((entry) => entry.snapshot.timestamp >= query.from && entry.snapshot.timestamp <= query.to)
      .filter((entry) => !query.template || entry.template.templateId === query.template)
      .toSorted((left, right) => left.snapshot.timestamp.localeCompare(right.snapshot.timestamp));

    const timeline = snapshots.map((snapshot, index) => {
      const byStage = snapshot.snapshot.stage;
      const factor = defaultStages.indexOf(byStage);
      return {
        id: `${query.workspaceId}:${index}` as Brand<string, 'ProjectionPoint'>,
        key: snapshot.snapshot.artifactId,
        at: snapshot.snapshot.timestamp,
        values: snapshot.snapshot.metrics.map((metric) => metric.score + factor),
        severity: (factor >= 6 ? 'critical' : factor >= 4 ? 'high' : factor >= 2 ? 'medium' : 'low') as ProjectionSeverity,
      };
    });

    return success(timeline);
  }

  async prune(olderThan: string): Promise<Result<number>> {
    let removed = 0;
    for (const [, workspaces] of this.#identityBuckets) {
      for (const [trace, entries] of workspaces) {
        const kept = entries.filter((entry) => entry.snapshot.timestamp >= olderThan);
        removed += entries.length - kept.length;
        if (kept.length === 0) {
          workspaces.delete(trace);
          continue;
        }
        workspaces.set(trace, kept);
      }
    }

    for (const [artifactId, entries] of this.#artifactBuckets) {
      const kept = entries.filter((entry) => entry.snapshot.timestamp >= olderThan);
      removed += entries.length - kept.length;
      if (kept.length === 0) {
        this.#artifactBuckets.delete(artifactId);
        continue;
      }
      this.#artifactBuckets.set(artifactId, kept);
    }

    return success(removed);
  }

  snapshotState(workspaceId: HorizonWorkspaceId): Result<ProjectionStoreState> {
    const workspace = this.#identityBuckets.get(workspaceId);
    if (!workspace) {
      return fail(`missing workspace projection store ${workspaceId}`);
    }

    const snapshots = [...workspace.values()].flatMap((items) => items);
    const artifactCount = new Set(snapshots.map((snapshot) => snapshot.snapshot.artifactId)).size;
    return success({
      buckets: this.#identityBuckets.size,
      snapshots: snapshots.length,
      artifacts: artifactCount,
      route: this.#defaultRoute,
    });
  }
}

export const buildProjectionSummary = <TState extends NoInfer<ProjectionStoreState>>(state: TState): string => {
  return `global|${state.snapshots}|${state.buckets}|${state.artifacts}|${state.route}`;
};
