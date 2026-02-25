import { fail, ok, type Result } from '@shared/result';
import { decodeSnapshot, encodeSnapshot } from './serializer';
import type { StoreRecord, StoreSnapshot, MetricStoreQuery, StoreRecordState } from './models';
import type { LensTopology } from '@domain/recovery-lens-observability-models';
import { asWindowPriority, observerWindow } from '@domain/recovery-lens-observability-models';
import type { ObserverNamespace, MetricRecord, ObserverWindowId } from '@domain/recovery-lens-observability-models';

export interface LensStoreHandle {
  readonly namespace: ObserverNamespace;
  [Symbol.asyncDispose](): Promise<void>;
}

export class InMemoryLensStore implements LensStoreHandle {
  readonly #namespaces = new Map<ObserverNamespace, StoreRecord[]>();
  readonly #topologies = new Map<ObserverNamespace, LensTopology>();
  #closed = false;

  public constructor(readonly namespace: ObserverNamespace) {}

  public async ingest<TPayload extends Record<string, unknown>>(
    namespace: ObserverNamespace,
    points: readonly MetricRecord<TPayload>[],
  ): Promise<Result<number, Error>> {
    const bucket = this.#namespaces.get(namespace) ?? [];
    let index = 0;
    for (const point of points) {
      index += 1;
      bucket.push({
        id: `record:${namespace}:${Date.now()}:${index}` as never,
        namespace,
        state: 'open',
        path: point.metric,
        policy: {
          namespace,
          window: observerWindow(`${point.metric}-window`) as ObserverWindowId,
          mode: point.severity === 'critical' ? 'snapshot' : 'realtime',
          ttlMs: 10_000,
          priority: asWindowPriority(5),
        },
        createdAt: new Date().toISOString(),
        payload: point.payload as Record<string, unknown>,
      });
    }

    this.#namespaces.set(namespace, bucket);
    return ok(points.length);
  }

  public query<TPayload extends Record<string, unknown>>(query: MetricStoreQuery<TPayload>): Result<readonly StoreRecord<TPayload>[], Error> {
    const bucket = (this.#namespaces.get(query.namespace) ?? []) as StoreRecord<TPayload>[];
    const filtered = query.metric ? bucket.filter((record) => record.path === query.metric) : bucket;
    return ok(filtered);
  }

  public setTopology(namespace: ObserverNamespace, topology: LensTopology): void {
    this.#topologies.set(namespace, topology);
  }

  public getTopology(namespace: ObserverNamespace): LensTopology | undefined {
    return this.#topologies.get(namespace);
  }

  public async writeSnapshot(namespace: ObserverNamespace): Promise<Result<string, Error>> {
    const snapshot: StoreSnapshot = {
      namespace,
      schema: 1,
      records: this.#namespaces.get(namespace) ?? [],
      topology: this.#topologies.get(namespace),
    };
    return ok(encodeSnapshot(snapshot));
  }

  public async restore(namespace: ObserverNamespace, raw: string): Promise<Result<number, Error>> {
    const parsed = decodeSnapshot(raw);
    if (!parsed.ok) {
      return fail(new Error(parsed.error.message));
    }
    this.#namespaces.set(namespace, [...parsed.value.records]);
    if (parsed.value.topology) {
      this.#topologies.set(namespace, parsed.value.topology);
    }
    return ok(parsed.value.records.length);
  }

  public async snapshotAndPurge(namespace: ObserverNamespace): Promise<Result<number, Error>> {
    const snapshot = await this.writeSnapshot(namespace);
    if (!snapshot.ok) {
      return fail(snapshot.error);
    }
    const records = this.#namespaces.get(namespace) ?? [];
    this.#namespaces.set(
      namespace,
      [...records.filter((record) => record.state === ('closed' as StoreRecordState))],
    );
    return ok(snapshot.value.length);
  }

  public async close(): Promise<Result<number, Error>> {
    const records = this.#namespaces.get(this.namespace) ?? [];
    this.#closed = true;
    this.#namespaces.clear();
    this.#topologies.clear();
    return ok(records.length);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  public get closed(): boolean {
    return this.#closed;
  }
}

export const withStore = async <T>(namespace: ObserverNamespace, fn: (store: InMemoryLensStore) => Promise<T>): Promise<T> => {
  await using stack = new AsyncDisposableStack();
  const store = new InMemoryLensStore(namespace);
  stack.use(store);
  return fn(store);
};

export const collectNamespaces = (stores: Iterable<LensStoreHandle>): readonly ObserverNamespace[] => {
  return [...stores].map((store) => store.namespace);
};
