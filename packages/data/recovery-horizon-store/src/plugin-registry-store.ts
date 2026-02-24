import { withBrand } from '@shared/core';
import { err, ok, type Result } from '@shared/result';
import {
  type JsonValue,
  type PluginDependency,
  type PluginKind,
  type PluginManifest,
  type PluginManifestId,
  type PluginRoute,
  buildPluginTag,
  buildTopologySpec,
  pluginKinds,
  pluginStages,
} from '@domain/recovery-incident-lab-core';
import { pluginCatalogSeeds } from './plugin-catalog-seeds.js';

export type PluginRecordConfig = Record<string, JsonValue>;

export interface PluginRegistryRecord<
  TKind extends PluginKind = PluginKind,
  TConfig extends PluginRecordConfig = PluginRecordConfig,
  TRoute extends string = string,
> {
  readonly manifestId: PluginManifestId;
  readonly manifest: PluginManifest<TKind, TConfig, TRoute>;
  readonly installedAt: string;
  readonly touchedAt: string;
  readonly lastError?: string;
}

type Catalog = Map<PluginManifestId, PluginRegistryRecord>;

type RegistryEvent = {
  readonly at: string;
  readonly action: 'installed' | 'removed' | 'updated' | 'snapshot';
  readonly manifestId: PluginManifestId;
};

type SeedRecord = {
  readonly id: PluginManifestId;
  readonly kind: PluginKind;
  readonly namespace: string;
  readonly title: string;
};

export interface PluginStoreQuery {
  readonly kinds?: readonly PluginKind[];
  readonly route?: PluginRoute;
  readonly prefix?: string;
}

const nowMs = (): string => new Date().toISOString();

const coerceDependencies = (dependencies: readonly PluginDependency[]): PluginDependency[] => [...dependencies];

const createSeedManifest = (
  entry: SeedRecord,
): PluginRegistryRecord<PluginKind, PluginRecordConfig, string>['manifest'] => {
  const now = nowMs();
  const dependencies: PluginDependency[] = coerceDependencies([]);
  const route = `/recovery/${entry.kind}/${pluginStages[0]}` as PluginRoute;

  return {
    id: withBrand(entry.id, 'PluginManifestId'),
    namespace: withBrand(entry.namespace, 'PluginNamespace'),
    kind: entry.kind,
    route,
    version: '1.0.0',
    title: entry.title,
    tags: [buildPluginTag(entry.kind, `seed:${entry.id}`)],
    states: ['idle', 'warming', 'running', 'suspended', 'done', 'failed', 'stopped'],
    dependencies,
    createdAt: now,
    updatedAt: now,
    enabled: true,
    runId: withBrand(`${entry.namespace}:${entry.kind}:${now}`, 'PluginRunId'),
    capabilities: [],
    config: {
      kind: entry.kind,
      sampling: 0.4,
      emits: [['metric', `${entry.kind}.${entry.id}`]],
      rules: [],
      model: `${entry.kind}-baseline`,
      confidence: 77,
      iterations: 3,
      stages: [...pluginStages],
      timeoutMs: 500,
      endpoints: ['http://localhost'],
      quorum: 1,
      allowParallel: true,
      breakOn: [['error', 4]],
      fallback: 'skip',
    },
  };
};

const isKnownKind = (candidate: PluginKind): candidate is PluginKind =>
  pluginKinds.includes(candidate);

const isSeedRecordRoute = (
  record: PluginRegistryRecord,
  query: PluginStoreQuery,
): boolean => {
  const namespace = `${record.manifest.id}`;
  if (query.prefix && !namespace.includes(query.prefix)) {
    return false;
  }
  if (query.kinds && query.kinds.length > 0) {
    if (!query.kinds.every((kind) => isKnownKind(kind))) {
      return false;
    }
    if (!query.kinds.includes(record.manifest.kind)) {
      return false;
    }
  }
  if (query.route && record.manifest.route !== query.route) {
    return false;
  }

  return true;
};

const toArray = async <T>(values: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const value of values) {
    out.push(value);
  }
  return out;
};

export class RecoveryPluginRegistryStore implements AsyncDisposable {
  readonly #records: Catalog = new Map();
  readonly #events: RegistryEvent[] = [];
  readonly #stack = new AsyncDisposableStack();

  constructor(seed: readonly SeedRecord[] = pluginCatalogSeeds) {
    for (const entry of seed) {
      const now = nowMs();
      const manifestId = entry.id;
      const manifest = createSeedManifest(entry);

      this.#events.push({ at: now, action: 'installed', manifestId });
      this.#records.set(manifestId, {
        manifestId,
        manifest,
        installedAt: now,
        touchedAt: now,
      });
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#stack.disposeAsync().catch((error: unknown) => {
      void error;
    });
  }

  async list(query: PluginStoreQuery = {}): Promise<Result<readonly PluginRegistryRecord[]>> {
    try {
      const filtered = await toArray(this.scan(query));
      return ok(filtered);
    } catch (error) {
      return err(error as Error);
    }
  }

  async get(manifestId: PluginManifestId): Promise<Result<PluginRegistryRecord | undefined>> {
    return ok(this.#records.get(manifestId));
  }

  async upsert(record: PluginRegistryRecord): Promise<Result<PluginRegistryRecord>> {
    const previous = this.#records.get(record.manifestId);
    const next = {
      ...record,
      installedAt: previous?.installedAt ?? nowMs(),
      touchedAt: nowMs(),
    };
    this.#records.set(record.manifestId, next);
    this.#events.push({
      at: nowMs(),
      action: previous ? 'updated' : 'installed',
      manifestId: record.manifestId,
    });
    return ok(next);
  }

  async remove(manifestId: PluginManifestId): Promise<Result<boolean>> {
    const removed = this.#records.delete(manifestId);
    if (removed) {
      this.#events.push({ at: nowMs(), action: 'removed', manifestId });
      return ok(true);
    }
    return ok(false);
  }

  async *scan(query: PluginStoreQuery = {}): AsyncGenerator<PluginRegistryRecord> {
    const values = [...this.#records.values()];
    for (const record of values) {
      if (!isSeedRecordRoute(record, query)) {
        continue;
      }
      await Promise.resolve();
      yield record;
    }
  }

  async *events(): AsyncGenerator<RegistryEvent> {
    for (const event of this.#events) {
      await Promise.resolve();
      yield event;
    }
  }

  toTopology(namespace: string) {
    const manifests = [...this.#records.values()].map((entry) => entry.manifest);
    return buildTopologySpec(namespace, manifests);
  }
}

export const pluginStoreFactory = async (): Promise<RecoveryPluginRegistryStore> => {
  const store = new RecoveryPluginRegistryStore(pluginCatalogSeeds);
  const entries = await toArray(store.scan());
  if (entries.length === 0) {
    throw new Error('plugin registry seed incomplete');
  }
  return store;
};
