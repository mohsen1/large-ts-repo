import { fail, ok, type Result } from '@shared/result';
import { asRunId, asStreamId, asTenantId, type LatticeRunId } from '@domain/recovery-lattice';
import type { LatticeSignalEvent, LatticeBatchRequest, LatticeBatchResult, LatticeQuery, LatticeTimeline, LatticeStoreSnapshot } from './models';
import { makeSnapshotId, makeWindow } from './models';
import { withBrand } from '@shared/core';

interface TimelineCursor {
  readonly streamId: string;
  readonly events: readonly LatticeSignalEvent[];
}

const toTimelineKey = (tenantId: string, streamId: string): string => `${tenantId}::${streamId}`;
const now = (): string => new Date().toISOString();

const sortEventsByTime = (events: readonly LatticeSignalEvent[]): readonly LatticeSignalEvent[] =>
  events.toSorted((left, right) => left.at.localeCompare(right.at));

const splitChunks = <T>(values: readonly T[], size: number): readonly (readonly T[])[] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export interface LatticeStoreRepository {
  saveBatch(request: LatticeBatchRequest): Promise<Result<LatticeBatchResult, string>>;
  queryTimeline(query: LatticeQuery): Promise<readonly LatticeTimeline[]>;
  queryWindows(streamId: string): Promise<readonly ReturnType<typeof makeWindow>[]>;
  streamSignals(streamId: string): Promise<AsyncIterable<LatticeSignalEvent>>;
}

export class InMemoryLatticeStore implements LatticeStoreRepository, AsyncDisposable {
  #timelines = new Map<string, TimelineCursor>();
  #runs = new Map<string, LatticeRunId>();
  #snapshots = new Map<string, LatticeStoreSnapshot[]>();

  async saveBatch(request: LatticeBatchRequest): Promise<Result<LatticeBatchResult, string>> {
    const parsed: LatticeBatchRequest = {
      tenantId: request.tenantId,
      streamId: request.streamId,
      topology: request.topology,
      records: request.records,
      tags: request.tags,
    };
    const tenantId = parsed.tenantId;
    const streamId = parsed.streamId;
    if (!tenantId || !streamId) {
      return fail('invalid-batch');
    }

    const key = toTimelineKey(String(tenantId), String(streamId));
    const prior = this.#timelines.get(key)?.events ?? [];
    const merged = sortEventsByTime([...prior, ...parsed.records]);
    this.#timelines.set(key, { streamId: String(streamId), events: merged });

    const runId = asRunId(`run-${tenantId}-${streamId}-${Date.now()}`);
    this.#runs.set(key, runId);
    const snapshot = this.buildSnapshot(key, runId, parsed.topology, merged);
    this.#snapshots.set(key, [...(this.#snapshots.get(key) ?? []), snapshot]);

    return ok({
      snapshotId: snapshot.id,
      windowId: makeWindow(streamId, merged).id,
      accepted: merged.length,
      rejected: 0,
    });
  }

  async queryTimeline(query: LatticeQuery): Promise<readonly LatticeTimeline[]> {
    const timelines = [...this.#timelines.entries()]
      .filter(([key]) => {
        if (query.tenantId && !key.startsWith(`${String(query.tenantId)}::`)) return false;
        if (query.streamId && !key.endsWith(`::${String(query.streamId)}`)) return false;
        return true;
      })
      .map(([, cursor]) => ({
        tenantId: cursor.events[0]?.tenantId ?? asTenantId('tenant://fallback'),
        streamId: asStreamId(cursor.streamId),
        events: cursor.events.filter((event) => {
          if (query.since && event.at < query.since) return false;
          if (query.until && event.at > query.until) return false;
          return true;
        }),
        updatedAt: now(),
      }));
    return timelines;
  }

  async queryWindows(streamId: string): Promise<readonly ReturnType<typeof makeWindow>[]> {
    const values = [...this.#timelines.entries()].flatMap(([, cursor]) =>
      cursor.streamId === streamId ? cursor.events : [],
    );
    return splitChunks(values, 6).map((chunk) => makeWindow(asStreamId(streamId), chunk));
  }

  async streamSignals(streamId: string): Promise<AsyncIterable<LatticeSignalEvent>> {
    const events = [...this.#timelines.values()].find((entry) => entry.streamId === streamId)?.events ?? [];
    return (async function* () {
      for (const batch of splitChunks(events, 4)) {
        for (const event of batch) {
          yield event;
        }
      }
    })();
  }

  private buildSnapshot(
    _key: string,
    runId: LatticeRunId,
    topology: LatticeBatchRequest['topology'],
    events: readonly LatticeSignalEvent[],
  ): LatticeStoreSnapshot {
    const streamId = events[0]?.streamId ?? `stream://auto-${Date.now()}`;
    return {
      id: makeSnapshotId(runId),
      tenantId: events[0]?.tenantId ?? asTenantId('tenant://fallback'),
      streamId: asStreamId(streamId),
      topology,
      records: events,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#timelines.clear();
    this.#runs.clear();
    this.#snapshots.clear();
  }
}

export const collectSignals = (timeline: LatticeTimeline): readonly LatticeSignalEvent[] =>
  timeline.events.toSorted((left, right) => left.at.localeCompare(right.at));

export const streamToArray = async (stream: AsyncIterable<LatticeSignalEvent>): Promise<readonly LatticeSignalEvent[]> => {
  const values: LatticeSignalEvent[] = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
};

export const describeRun = async (store: LatticeStoreRepository, query: LatticeQuery): Promise<string> => {
  const timeline = await store.queryTimeline(query);
  return `${timeline.length}:${timeline.map((entry) => entry.streamId).join(',')}`;
};
