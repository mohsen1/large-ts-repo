import { NoInfer } from '@shared/type-level';
import type { AnySignalEnvelope, SignalLayer, SignalRunId } from '@domain/recovery-cockpit-cognitive-core';
import {
  type StoreSignal,
  type SignalQuery,
  type WorkspaceState,
  signalStoreLayers,
  type SignalStoreLayer,
} from './models';

type AsyncDisposer = {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

type StackCtor = new () => AsyncDisposer;
const createAsyncStack = (): AsyncDisposer => {
  const ctor = (globalThis as unknown as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack;
  if (ctor) {
    return new ctor();
  }
  return {
    [Symbol.dispose]: () => {},
    [Symbol.asyncDispose]: async () => {},
  };
};

type Listener = (event: { readonly type: string; readonly signal: StoreSignal }) => void;

interface WorkspacePartition {
  readonly runIds: Map<SignalRunId, StoreSignal[]>;
  readonly latestSignal: StoreSignal[];
  readonly listeners: Set<Listener>;
}

export interface SignalStore {
  save(signal: NoInfer<StoreSignal>): Promise<void>;
  query(query: NoInfer<SignalQuery>): Promise<readonly StoreSignal[]>;
  queryOne(runId: SignalRunId): Promise<readonly StoreSignal[]>;
  observe(runId: SignalRunId, listener: Listener): { [Symbol.dispose](): void };
  state(query: NoInfer<SignalQuery>): Promise<WorkspaceState>;
  [Symbol.asyncDispose](): Promise<void>;
}

export class CognitiveSignalStore implements SignalStore {
  readonly #workspaces = new Map<string, WorkspacePartition>();
  readonly #stack: AsyncDisposer;
  readonly #maxPerWorkspace: number;

  public constructor(private readonly options: { readonly maxPerRun?: number; readonly ttlMinutes?: number } = {}) {
    this.#stack = createAsyncStack();
    this.#maxPerWorkspace = Math.max(1, options.maxPerRun ?? 800);
  }

  public async save(signal: NoInfer<StoreSignal>): Promise<void> {
    const key = this.key(signal.tenantId, signal.workspaceId);
    const partition = this.#workspaces.get(key) ?? this.bootstrap(key);
    const nextForRun = [...(partition.runIds.get(signal.runId) ?? []), signal].toSorted(
      (left, right) => Date.parse(left.emittedAt) - Date.parse(right.emittedAt),
    );
    partition.runIds.set(
      signal.runId,
      nextForRun.slice(-this.#maxPerWorkspace),
    );
    partition.latestSignal.push(signal);
    if (partition.latestSignal.length > this.#maxPerWorkspace) {
      partition.latestSignal.length = this.#maxPerWorkspace;
    }
    for (const listener of partition.listeners) {
      listener({ type: 'append', signal });
    }
  }

  public async query(query: SignalQuery): Promise<readonly StoreSignal[]> {
    const key = this.key(query.tenantId, query.workspaceId);
    const partition = this.#workspaces.get(key);
    if (!partition) return [];
    const layers = new Set(query.layers as SignalStoreLayer[] | undefined);
    const runIds = new Set(query.runIds ?? []);
    const matched = [...partition.latestSignal].filter((signal) => {
      const byLayer = !query.layers || query.layers.length === 0 || layers.has(signal.layer as SignalStoreLayer);
      const byRun = !query.runIds || query.runIds.length === 0 || runIds.has(signal.runId);
      const byKinds = !query.kinds || query.kinds.length === 0 || query.kinds.includes(signal.kind);
      const byAt = (!query.minEmittedAt || signal.emittedAt >= query.minEmittedAt) &&
        (!query.maxEmittedAt || signal.emittedAt <= query.maxEmittedAt);
      const byWarnings = !query.includeWarningsOnly || signal.tags['warning']?.length > 0;
      return byLayer && byRun && byKinds && byAt && byWarnings;
    });

    const sorted = query.sortByAt === 'asc'
      ? matched.toSorted((left, right) => Date.parse(left.emittedAt) - Date.parse(right.emittedAt))
      : matched.toSorted((left, right) => Date.parse(right.emittedAt) - Date.parse(left.emittedAt));
    if (!query.cursor) {
      return sorted;
    }
    return sorted.slice(query.cursor.offset, query.cursor.offset + query.cursor.limit);
  }

  public async queryOne(runId: SignalRunId): Promise<readonly StoreSignal[]> {
    const allRuns = [...this.#workspaces.values()].flatMap((partition) => [...partition.runIds.values()]);
    return allRuns
      .flatMap((run) => run)
      .filter((signal) => signal.runId === runId)
      .toSorted((left, right) => Date.parse(right.emittedAt) - Date.parse(left.emittedAt));
  }

  public async state(query: SignalQuery): Promise<WorkspaceState> {
    const rows = await this.query(query);
    const byLayer = signalStoreLayers.reduce((acc, layer) => {
      acc[layer] = rows.filter((signal) => signal.layer === layer).length;
      return acc;
    }, {} as Record<SignalLayer, number>);
    return {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      signals: [...rows],
      nextCursor: {
        limit: 100,
        offset: rows.length,
        runId: (rows.at(0)?.runId ?? 'unbound::run') as SignalRunId,
      },
      stats: {
        total: rows.length,
        byLayer,
        lastUpdated: rows.at(0)?.emittedAt ?? new Date(0).toISOString(),
      },
    };
  }

  public observe(runId: SignalRunId, listener: Listener) {
    const partitions = [...this.#workspaces.values()];
    for (const partition of partitions) {
      if (partition.runIds.has(runId)) {
        partition.listeners.add(listener);
      }
    }
    return {
      [Symbol.dispose]: () => {
        for (const partition of partitions) {
          partition.listeners.delete(listener);
        }
      },
    };
  }

  public async *stream(query: SignalQuery): AsyncGenerator<StoreSignal, void, void> {
    const rows = await this.query(query);
    for (const row of rows.toSorted((left, right) => Date.parse(left.emittedAt) - Date.parse(right.emittedAt))) {
      yield row;
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#workspaces.clear();
    await this.#stack[Symbol.asyncDispose]();
  }

  private bootstrap(key: string): WorkspacePartition {
    const created: WorkspacePartition = {
      runIds: new Map(),
      latestSignal: [],
      listeners: new Set(),
    };
    this.#workspaces.set(key, created);
    return created;
  }

  private key(tenantId: string, workspaceId: string): string {
    return `${tenantId}:${workspaceId}`;
  }

  public projectLayerCounts(signals: readonly StoreSignal[]): Readonly<Record<SignalStoreLayer, number>> {
    return signalStoreLayers.reduce(
      (acc, layer) => {
        acc[layer] = signals.filter((signal) => signal.layer === layer).length;
        return acc;
      },
      {} as Record<SignalStoreLayer, number>,
    );
  }
}

export const gatherSignals = (signals: readonly AnySignalEnvelope[]): Readonly<Record<SignalLayer, number>> =>
  signalStoreLayers.reduce(
    (acc, layer) => {
      acc[layer] = signals.filter((signal) => signal.layer === layer).length;
      return acc;
    },
    {} as Record<SignalLayer, number>,
  );
