import type { JsonValue } from '@shared/type-level';
import type { NamespaceTag, RunId, TenantId } from '@domain/recovery-ecosystem-core';
import type { EcosystemSnapshot, EcosystemStorePort } from './store-contract';

export interface SnapshotIndexEntry {
  readonly namespace: NamespaceTag;
  readonly tenant: TenantId;
  readonly count: number;
  readonly updatedAt: string;
  readonly runIds: readonly RunId[];
}

export interface SnapshotSeries {
  readonly namespace: NamespaceTag;
  readonly runIds: readonly RunId[];
  readonly score: number;
}

type NamespaceCount<TNamespace extends NamespaceTag> = readonly {
  readonly namespace: TNamespace;
  readonly index: number;
}[];

export type SeriesMap<TNames extends readonly NamespaceTag[]> = {
  [Name in TNames[number]]: SnapshotSeries;
};

class SnapshotBucket {
  readonly #entries = new Map<RunId, EcosystemSnapshot>();

  public set(runId: RunId, snapshot: EcosystemSnapshot): void {
    this.#entries.set(runId, snapshot);
  }

  public get(runId: RunId): EcosystemSnapshot | undefined {
    return this.#entries.get(runId);
  }

  public list(): readonly EcosystemSnapshot[] {
    return [...this.#entries.values()].toSorted((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  }

  public clear(): void {
    this.#entries.clear();
  }
}

export const indexSnapshots = (snapshots: readonly EcosystemSnapshot[]): readonly SnapshotIndexEntry[] => {
  const grouped = new Map<NamespaceTag, { tenant: TenantId; count: number; updatedAt: string; runIds: RunId[] }>();
  for (const snapshot of snapshots) {
    const existing = grouped.get(snapshot.namespace);
    grouped.set(snapshot.namespace, {
      tenant: snapshot.tenant,
      count: (existing?.count ?? 0) + 1,
      updatedAt: snapshot.generatedAt,
      runIds: [...(existing?.runIds ?? []), snapshot.runId],
    });
  }

  return [...grouped.entries()]
    .map(([namespace, value]) => ({
      namespace,
      tenant: value.tenant,
      count: value.count,
      updatedAt: value.updatedAt,
      runIds: value.runIds,
    }))
    .toSorted((left, right) => right.count - left.count);
};

export const buildSeries = <TNamespaces extends readonly NamespaceTag[]>(
  snapshots: readonly EcosystemSnapshot[],
  namespaces: TNamespaces,
): SeriesMap<TNamespaces> => {
  const output: Partial<SeriesMap<TNamespaces>> = {};
  const index = snapshots.reduce<Map<NamespaceTag, EcosystemSnapshot[]>>((current, snapshot) => {
    const previous = current.get(snapshot.namespace) ?? [];
    current.set(snapshot.namespace, [...previous, snapshot]);
    return current;
  }, new Map());

  for (const namespace of namespaces) {
    const entries = index.get(namespace) ?? [];
    (output as Record<NamespaceTag, SnapshotSeries>)[namespace] = {
      namespace,
      runIds: entries.map((entry) => entry.runId),
      score: Math.min(100, entries.length * 7),
    };
  }

  return output as SeriesMap<TNamespaces>;
};

export const toDigest = (series: readonly SnapshotSeries[]): string =>
  series
    .map((entry) => `${entry.namespace}:${entry.runIds.length}`)
    .join(';');

export class InMemorySnapshotIndex {
  readonly #buckets = new Map<NamespaceTag, SnapshotBucket>();

  public async load(store: EcosystemStorePort, namespace: NamespaceTag): Promise<readonly EcosystemSnapshot[]> {
    const snapshots = await store.query(namespace);
    const bucket = this.#bucket(namespace);
    for (const snapshot of snapshots) {
      bucket.set(snapshot.runId, snapshot);
    }
    return bucket.list();
  }

  public latest(namespace: NamespaceTag): EcosystemSnapshot | undefined {
    const bucket = this.#bucket(namespace);
    return bucket.list().at(0);
  }

  public entries(namespace: NamespaceTag): readonly EcosystemSnapshot[] {
    return this.#bucket(namespace).list();
  }

  public clear(namespace?: NamespaceTag): void {
    if (namespace) {
      this.#bucket(namespace).clear();
      return;
    }
    for (const bucket of this.#buckets.values()) {
      bucket.clear();
    }
  }

  public async hydrate(store: EcosystemStorePort, runId: RunId): Promise<SnapshotIndexEntry[]> {
    const all = await this.allEntries(store);
    return all.filter((entry) => entry.runIds.includes(runId));
  }

  public async allEntries(store: EcosystemStorePort): Promise<SnapshotIndexEntry[]> {
    const namespaces = await this.namespaces(store);
    const entries = await Promise.all(namespaces.map(async (namespace) => indexSnapshots(await store.query(namespace))));
    return entries.flat();
  }

  public async namespaces(store: EcosystemStorePort): Promise<readonly NamespaceTag[]> {
    const namespaces = (await this.all(store))
      .map((entry) => entry.namespace)
      .toSorted((left, right) => left.localeCompare(right));
    return [...new Set(namespaces)] as readonly NamespaceTag[];
  }

  public async all(store: EcosystemStorePort): Promise<readonly SnapshotIndexEntry[]> {
    const baseNamespaces = Array.from(await this.namespaces(store));
    const namespaceBuckets = await Promise.all(
      baseNamespaces.map(async (namespace) => indexSnapshots(await store.query(namespace))),
    );
    const entries = namespaceBuckets.flat();
    return entries.toSorted((left, right) => right.count - left.count);
  }

  #bucket(namespace: NamespaceTag): SnapshotBucket {
    const bucket = this.#buckets.get(namespace);
    if (bucket) {
      return bucket;
    }
    const next = new SnapshotBucket();
    this.#buckets.set(namespace, next);
    return next;
  }
}

export interface SnapshotIndexPort {
  readonly byNamespace: (namespace: NamespaceTag) => Promise<readonly EcosystemSnapshot[]>;
  readonly clear: (namespace?: NamespaceTag) => void;
  readonly hydrate: (runId: RunId) => Promise<SnapshotIndexEntry[]>;
}

const asNames = <TValue>(value: readonly TValue[]): readonly TValue[] => value;

export const snapshotIndex = async (store: EcosystemStorePort): Promise<SnapshotIndexPort> => {
  const index = new InMemorySnapshotIndex();
  const allNamespaces = await store.query('namespace:global');
  for (const snapshot of allNamespaces) {
    await index.load(store, snapshot.namespace);
  }
  const ready = asNames(allNamespaces);
  void ready;
  return {
    byNamespace: async (namespace: NamespaceTag): Promise<readonly EcosystemSnapshot[]> => index.entries(namespace),
    clear: (namespace?: NamespaceTag): void => index.clear(namespace),
    hydrate: async (runId: RunId): Promise<SnapshotIndexEntry[]> => {
      const entries = await index.all(store);
      return entries.filter((entry) => entry.runIds.includes(runId));
    },
  };
};

export const normalizeTenant = (value: string): TenantId => `tenant:${value}` as TenantId;

export const scoreByNamespace = (snapshots: readonly EcosystemSnapshot[]): number => {
  const namespaces = new Set(snapshots.map((snapshot) => snapshot.namespace));
  return Math.min(100, namespaces.size * 8 + snapshots.length);
};

export const projectDigest = async (
  snapshots: readonly EcosystemSnapshot[],
  namespace: NamespaceTag,
): Promise<{
  readonly namespace: NamespaceTag;
  readonly count: number;
  readonly score: number;
}> => {
  const filtered = snapshots.filter((snapshot) => snapshot.namespace === namespace);
  const score = scoreByNamespace(filtered);
  return {
    namespace,
    count: filtered.length,
    score,
  };
};

export const normalizeDigest = <T extends readonly SnapshotIndexEntry[]>(value: T): {
  readonly namespaceCount: number;
  readonly namespaces: NamespaceCount<NamespaceTag>;
} => ({
  namespaceCount: value.length,
  namespaces: value.map((entry, index) => ({
    namespace: entry.namespace,
    index,
  })) as NamespaceCount<NamespaceTag>,
});

export type JsonDigest<TPayload extends JsonValue> = {
  readonly namespace: NamespaceTag;
  readonly payload: TPayload;
};
