import type { ReadinessRunId, ReadinessSignal, ReadinessTarget, ReadinessPolicy } from '@domain/recovery-readiness';
import type { ReadinessEventEnvelope, ReadinessEventBucket, ReadinessEventHealth } from '@domain/recovery-readiness';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import { buildReadinessEventHealth, bucketizeEvents } from '@domain/recovery-readiness';
import { MemoryReadinessRepository, type ReadinessRepository } from './repository';

export interface ReadinessEventRepository {
  append(events: ReadonlyArray<ReadinessEventEnvelope>): Promise<Result<'ok', Error>>;
  byRun(runId: ReadinessRunId): Promise<ReadinessEventEnvelope[]>;
  all(): Promise<ReadinessEventEnvelope[]>;
  health(runId: ReadinessRunId): Promise<ReadinessEventHealth>;
}

interface ReadinessEventSearchFilter {
  runId?: ReadinessRunId;
  source?: ReadinessEventEnvelope['signal']['source'];
  action?: ReadinessEventEnvelope['action'];
  region?: string;
}

export interface ReadinessEventStoreStats {
  runCount: number;
  eventCount: number;
  resolvedRatio: number;
  lastUpdatedAt: string;
}

interface BucketQuery {
  windowMinutes: number;
}

const ensureRepository = (repo?: ReadinessRepository): ReadinessRepository => repo ?? new MemoryReadinessRepository();

export class InMemoryReadinessEventStore implements ReadinessEventRepository {
  private readonly events = new Map<string, ReadinessEventEnvelope[]>();
  private readonly bucketIndex = new Map<string, ReadonlyArray<ReadinessEventBucket>>();
  private readonly repo: ReadinessRepository;
  private readonly startedAt = Date.now();

  constructor(repo?: ReadinessRepository) {
    this.repo = ensureRepository(repo);
  }

  async append(events: ReadonlyArray<ReadinessEventEnvelope>): Promise<Result<'ok', Error>> {
    try {
      for (const event of events) {
        const runEvents = this.events.get(event.runId) ?? [];
        runEvents.push(event);
        runEvents.sort((left, right) => right.actionAt.localeCompare(left.actionAt));
        this.events.set(event.runId, runEvents);
      }
      return ok('ok');
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('append failed'));
    }
  }

  async byRun(runId: ReadinessRunId): Promise<ReadinessEventEnvelope[]> {
    return this.events.get(runId) ?? [];
  }

  async all(): Promise<ReadinessEventEnvelope[]> {
    const all: ReadinessEventEnvelope[] = [];
    for (const values of this.events.values()) {
      all.push(...values);
    }
    return all.sort((left, right) => right.actionAt.localeCompare(left.actionAt));
  }

  async health(runId: ReadinessRunId): Promise<ReadinessEventHealth> {
    return buildReadinessEventHealth(runId, await this.byRun(runId));
  }

  queryBuckets(runId: ReadinessRunId, query: BucketQuery): ReadonlyArray<ReadinessEventBucket> {
    const key = `${runId}|${query.windowMinutes}`;
    const cached = this.bucketIndex.get(key);
    if (cached) {
      return cached;
    }

    const buckets = bucketizeEvents(this.events.get(runId) ?? [], query.windowMinutes);
    this.bucketIndex.set(key, buckets);
    return buckets;
  }

  async filter(filter: ReadinessEventSearchFilter): Promise<ReadinessEventEnvelope[]> {
    const events = filter.runId ? await this.byRun(filter.runId) : await this.all();
    return events.filter((event) => {
      if (filter.action && event.action !== filter.action) return false;
      if (filter.source && event.signal.source !== filter.source) return false;
      if (filter.region && event.signal.region !== filter.region) return false;
      return true;
    });
  }

  async summary(): Promise<ReadinessEventStoreStats> {
    const all = await this.all();
    const runSet = new Set(all.map((event) => event.runId));
    const resolved = all.filter((event) => event.action === 'resolved').length;
    return {
      runCount: runSet.size,
      eventCount: all.length,
      resolvedRatio: all.length > 0 ? resolved / all.length : 0,
      lastUpdatedAt: new Date(this.startedAt).toISOString(),
    };
  }

  async alignWithRepository(runId: ReadinessRunId): Promise<ReadinessRunId | undefined> {
    const model = await this.repo.byRun(runId);
    if (!model) return undefined;
    const events = await this.byRun(runId);
    return events.length === 0 ? undefined : runId;
  }
}

export interface EventProjection {
  runId: ReadinessRunId;
  policy: ReadinessPolicy;
  targetIds: ReadonlyArray<ReadinessTarget['id']>;
  signalCount: number;
  weightedRisk: number;
}

export const projectEventsByRun = (
  events: ReadonlyArray<ReadinessEventEnvelope>,
): EventProjection[] => {
  const grouped = new Map<ReadinessRunId, ReadinessEventEnvelope[]>();
  for (const event of events) {
    const current = grouped.get(event.runId) ?? [];
    current.push(event);
    grouped.set(event.runId, current);
  }

  const projections: EventProjection[] = [];
  for (const [runId, groupedEvents] of grouped.entries()) {
    const weight = groupedEvents.reduce((sum, event) => sum + event.signal.confidence, 0);
    const targetIds = Array.from(
      new Set(
        groupedEvents
          .map((event) => event.signal.details.targetId as ReadinessTarget['id'])
          .filter((value): value is ReadinessTarget['id'] => value !== undefined),
      ),
    );

    projections.push({
      runId,
      policy: {
        policyId: `policy:${runId}`,
        name: 'default-projection-policy',
        constraints: {
          key: `constraints:${runId}`,
          minWindowMinutes: 15,
          maxWindowMinutes: 180,
          minTargetCoveragePct: 0.5,
          forbidParallelity: false,
        },
        allowedRegions: new Set(['global', 'us-east-1', 'us-west-2']),
        blockedSignalSources: ['manual-check'],
      },
      targetIds,
      signalCount: groupedEvents.length,
      weightedRisk: Number(weight.toFixed(2)),
    });
  }

  return projections;
};

export const normalizeSignals = (signals: ReadonlyArray<ReadinessSignal>): ReadinessSignal[] =>
  signals.map((signal, index) => ({
    ...signal,
    targetId: signal.targetId ?? (`target:${index}` as ReadinessSignal['targetId']),
  }));
