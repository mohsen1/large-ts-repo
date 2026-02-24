import { fail, ok, Result } from '@shared/result';
import { PolicyStoreRunRecord } from './types';
import { InMemoryPolicyStore } from './store';

export type EventSeverity = 'info' | 'warn' | 'error' | 'debug';
export type LedgerEventId = `event:${string}`;

export interface PolicyLedgerEvent {
  readonly id: LedgerEventId;
  readonly runId: string;
  readonly at: string;
  readonly severity: EventSeverity;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PolicyEventEnvelope {
  readonly event: PolicyLedgerEvent;
  readonly index: number;
}

export interface PolicyLedgerWindow {
  readonly key: string;
  readonly count: number;
  readonly errors: number;
}

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(transform: (item: T) => U): IterableChain<U>;
  filter(predicate: (value: T) => boolean): IterableChain<T>;
  toArray(): T[];
};
type IterableChain<T> = { [K in keyof IteratorChain<T>]: IteratorChain<T>[K] };

const toIteratorChain = <T>(items: Iterable<T>): IterableChain<T> | null =>
  ((globalThis as { Iterator?: { from?: <V>(value: Iterable<V>) => IterableChain<V> } }).Iterator?.from?.(items)) ?? null;

const newEventId = (runId: string): LedgerEventId => {
  const nonce = Math.floor(Math.random() * 1_000_000);
  return `event:${runId}:${Date.now()}:${nonce}` as LedgerEventId;
};

export const eventSeverityWeight = (event: PolicyLedgerEvent): number =>
  event.severity === 'error' ? 3 : event.severity === 'warn' ? 2 : 1;

export class PolicyEventLedger implements AsyncDisposable {
  readonly #events: PolicyLedgerEvent[] = [];
  readonly #maxSize: number;
  #closed = false;

  public constructor(maxSize = 250) {
    this.#maxSize = Math.max(10, maxSize);
  }

  public append(event: PolicyLedgerEvent): void {
    if (this.#closed) return;
    this.#events.push(event);
    if (this.#events.length > this.#maxSize) this.#events.splice(0, this.#events.length - this.#maxSize);
  }

  public snapshot(limit = 40): readonly PolicyEventEnvelope[] {
    const chain = toIteratorChain(this.#events);
    const entries = chain
      ? chain.toArray().map((event, index): PolicyEventEnvelope => ({ event, index }))
      : this.#events.map((event, index): PolicyEventEnvelope => ({ event, index }));
    const filtered = entries.filter((entry: PolicyEventEnvelope) => entry.event.severity !== 'debug');
    return filtered.slice(-Math.min(limit, this.#events.length));
  }

  public collectErrors(): readonly PolicyLedgerEvent[] {
    return this.#events.filter((event) => event.severity === 'error');
  }

  public clear(): void {
    this.#events.length = 0;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.clear();
    return Promise.resolve();
  }
}

export interface PolicyEventSummary {
  readonly total: number;
  readonly bySeverity: Record<EventSeverity, number>;
  readonly topRunId: string;
  readonly latestEventAt: string;
}

export const collectStoreEventsAsLedger = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
  limit = 50,
): Promise<Result<readonly PolicyEventEnvelope[], Error>> => {
  try {
    const runRecords = await store.searchRuns(orchestratorId);
    const stack = new AsyncDisposableStack();
    const ledger = stack.use(new PolicyEventLedger(limit));
    const seed = new Map<string, number>([['error', 0], ['warn', 0], ['info', 0], ['debug', 0]] as Array<[EventSeverity, number]>);
    const events = runRecords.flatMap((run) => {
      const score = run.metrics['score'];
      const severity = score >= 90 ? 'error' : score >= 70 ? 'warn' : score >= 50 ? 'info' : 'debug';
      const id = newEventId(run.runId);
      const event: PolicyLedgerEvent = {
        id,
        runId: run.runId,
        at: run.updatedAt,
        severity: severity as EventSeverity,
        details: {
          planId: run.planId,
          actor: run.actor,
          status: run.status,
          score,
        },
      };
      return [event];
    });

    for (const event of events) {
      ledger.append(event);
      const next = (seed.get(event.severity) ?? 0) + 1;
      seed.set(event.severity, next);
      if (event.severity === 'error') {
        seed.set('error', next);
      }
    }

    const snapshot = ledger.snapshot(limit);
    await stack.disposeAsync();

    return ok(snapshot);
  } catch (cause) {
    return fail(cause instanceof Error ? cause : new Error('collectStoreEventsAsLedger failed'));
  }
};

export const summarizeLedger = (events: readonly PolicyEventEnvelope[]): PolicyEventSummary => {
  const bySeverity = events.reduce<Record<EventSeverity, number>>((acc, current) => {
    acc[current.event.severity] += 1;
    return acc;
  }, {
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
  } as Record<EventSeverity, number>);

  return {
    total: events.length,
    bySeverity,
    topRunId: events.at(-1)?.event.runId ?? '',
    latestEventAt: events.at(-1)?.event.at ?? '',
  };
};

export const collectWindowFromRuns = (runs: readonly PolicyStoreRunRecord[], windowMs = 20_000): readonly PolicyLedgerWindow[] => {
  const ordered = [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const start = Date.parse(ordered[0]?.createdAt ?? new Date().toISOString());
  const end = Date.parse(ordered[ordered.length - 1]?.createdAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const points: PolicyLedgerWindow[] = [];
  const bucketSize = Math.max(1000, windowMs);
  for (let cursor = start; cursor <= end; cursor += bucketSize) {
    const boundary = cursor + bucketSize;
    const values = runs.filter((run) => {
      const value = Date.parse(run.updatedAt);
      return value >= cursor && value < boundary;
    });
    points.push({
      key: `${new Date(cursor).toISOString()}:${new Date(boundary).toISOString()}`,
      count: values.length,
      errors: values.filter((run) => run.status === 'failed').length,
    });
  }
  return points;
};
