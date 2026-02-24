import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizeLimit, withBrand, type Brand } from '@shared/core';
import { NoInfer, type Merge } from '@shared/type-level';
import {
  type MeshPayloadFor,
  type MeshPriority,
  type MeshRunId,
  type MeshSignalKind,
  type MeshTopology,
  type MeshTopologyPath,
} from './types';

export type MeshSignalCatalogItemId = Brand<string, 'MeshSignalCatalogItemId'>;
export type MeshSignalRouteId = Brand<string, 'MeshSignalRouteId'>;

type RouteValuePath = ReadonlyArray<string>;

type MapFromItems<TItems extends readonly SignalCatalogItem[]> = {
  [Item in TItems[number] as Item['id']]: Item;
};

export type SignalEnvelopeKey<T extends MeshSignalKind = MeshSignalKind> = `mesh-catalog:${T}:${string}`;

export type SignalCatalogItem<TKind extends MeshSignalKind = MeshSignalKind> = {
  readonly id: MeshSignalCatalogItemId;
  readonly kind: TKind;
  readonly priority: MeshPriority;
  readonly labels: readonly string[];
  readonly payload: MeshPayloadFor<TKind>;
  readonly key: SignalEnvelopeKey<TKind>;
  readonly createdAt: number;
};

export type SignalCatalogTuple<T extends readonly SignalCatalogItem[]> = T extends readonly [infer Head, ...infer Rest]
  ? Rest extends readonly SignalCatalogItem[]
    ? readonly [Head & SignalCatalogItem, ...SignalCatalogTuple<Rest>]
    : readonly [Head & SignalCatalogItem]
  : readonly [];

export type SignalPayloadMap<T extends SignalCatalogItem[]> = {
  [K in T[number] as K['kind']]: K['payload'];
};

export type SignalRouteKey<T extends MeshSignalKind, TItems extends readonly string[]> =
  T extends MeshSignalKind
    ? `${T}:${TItems[number] & string}:${number}`
    : never;

export interface CatalogQuery {
  readonly namespace?: string;
  readonly kind?: MeshSignalKind;
  readonly minPriority?: MeshPriority;
  readonly prefix?: string;
}

export interface SignalCatalogOptions {
  readonly namespace: string;
  readonly seed: bigint;
  readonly maxSize?: number;
  readonly runtime?: {
    readonly namespace: string;
    readonly pluginKeys: readonly string[];
  };
}

export interface SignalCatalogSearchResult {
  readonly node: readonly SignalPathRecord[];
  readonly score: number;
  readonly labels: readonly string[];
}

export interface SignalPathRecord {
  readonly route: string;
  readonly path: MeshTopologyPath;
  readonly labels: readonly string[];
}

const entrySchema = z.object({
  kind: z.enum(['pulse', 'snapshot', 'alert', 'telemetry']),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  labels: z.array(z.string()),
  payload: z.record(z.unknown()),
});

const catalogSeed = {
  namespace: 'mesh:catalog',
  createdBy: 'domain/recovery-ops-mesh',
  defaultKind: 'pulse',
} as const satisfies {
  readonly namespace: string;
  readonly createdBy: string;
  readonly defaultKind: MeshSignalKind;
};

export class MeshSignalCatalog<TCatalog extends readonly SignalCatalogItem[] = readonly SignalCatalogItem[]> {
  readonly #items: Map<SignalCatalogItem['id'], SignalCatalogItem>;
  readonly #namespace: string;
  readonly #seed: bigint;

  constructor(catalog: readonly SignalCatalogItem<MeshSignalKind>[], options: SignalCatalogOptions) {
    const source = catalogSeedSchema.parse(
      catalog.map((entry) => ({
        kind: entry.kind,
        priority: entry.priority,
        labels: [...entry.labels],
        payload: entry.payload as unknown as Record<string, unknown>,
      })),
    );

    const normalized = this.normalizeTokens(
      source
        .toSorted((left, right) => left.priority.localeCompare(right.priority))
        .map((entry, index) => `${entry.kind}:${index}`),
      options.seed,
    );

    this.#seed = options.seed;
    this.#namespace = `${options.namespace}:${catalogSeed.namespace}`;
    this.#items = new Map(
      source
        .toSorted((left, right) => left.priority.localeCompare(right.priority))
        .slice(0, normalizeLimit(options.maxSize))
        .map((entry, index): [SignalCatalogItem['id'], SignalCatalogItem] => {
          const kind = entry.kind as MeshSignalKind;
          const payload = entry.payload as MeshPayloadFor<MeshSignalKind>['payload'];

        const item = {
          id: withBrand(`${options.seed.toString(16)}:${normalized[index] ?? 'entry'}:${randomUUID()}`, 'MeshSignalCatalogItemId'),
          kind,
          payload: {
            kind,
            payload: payload as MeshPayloadFor<typeof kind>['payload'],
          },
          priority: entry.priority,
          labels: [...entry.labels],
          key: `mesh-catalog:${kind}:${options.seed.toString(16)}-${index}` as SignalEnvelopeKey<typeof kind>,
          createdAt: Date.now() + index,
          } as SignalCatalogItem<MeshSignalKind>;
          return [item.id, item];
        }),
    );
  }

  get namespace() {
    return this.#namespace;
  }

  snapshot = (): SignalCatalogSnapshot => ({
    id: withBrand(`${this.#namespace}-${this.#seed}`, 'MeshSignalRouteId'),
    size: this.#items.size,
    kinds: this.kinds().toSorted(),
    labels: this.labels().toSorted(),
  });

  kinds = (): MeshSignalKind[] =>
    [...new Set(Array.from(this.#items.values()).map((item) => item.kind))].toSorted();

  labels = (): readonly string[] =>
    [...new Set(Array.from(this.#items.values()).flatMap((item) => item.labels))].toSorted();

  has = (id: SignalCatalogItem['id']): boolean => this.#items.has(id);

  byId = (id: SignalCatalogItem['id']): TCatalog[number] | undefined =>
    this.#items.get(id) as TCatalog[number] | undefined;

  list = (): SignalCatalogTuple<TCatalog> =>
    Array.from(this.#items.values()) as unknown as SignalCatalogTuple<TCatalog>;

  byKind = <TKind extends MeshSignalKind>(kind: NoInfer<TKind>): readonly SignalCatalogItem<TKind>[] =>
    Array.from(this.#items.values()).filter((entry): entry is SignalCatalogItem<TKind> => entry.kind === kind);

  filter = (query: CatalogQuery): MeshSignalCatalog<TCatalog> => {
    const filtered = Array.from(this.#items.values()).filter((entry): entry is SignalCatalogItem => {
      if (query.kind && entry.kind !== query.kind) {
        return false;
      }

      if (query.minPriority && priorityRank(entry.priority) < priorityRank(query.minPriority)) {
        return false;
      }

      if (query.prefix && !entry.key.startsWith(query.prefix)) {
        return false;
      }

      return true;
    });

    const out = filtered.toSorted((left, right) => left.createdAt - right.createdAt);
    const safeItems = out as readonly SignalCatalogItem[];
    return new MeshSignalCatalog(safeItems, {
      namespace: `${this.#namespace}:filtered:${query.prefix ?? 'all'}`,
      seed: this.#seed + 1n,
      maxSize: query.minPriority ? 256 : undefined,
    }) as MeshSignalCatalog<TCatalog>;
  };

  merge = <TIncoming extends readonly SignalCatalogItem[]>(
    incoming: TIncoming,
  ): MeshSignalCatalog<
    Merge<TCatalog, TIncoming> extends SignalCatalogItem[] ? Merge<TCatalog, TIncoming> : SignalCatalogItem[]
  > => {
    const next = [...this.#items.values(), ...incoming] as Merge<TCatalog, TIncoming> extends SignalCatalogItem[]
      ? Merge<TCatalog, TIncoming>
      : SignalCatalogItem[];
    const catalog = new MeshSignalCatalog(next as readonly SignalCatalogItem[], {
      namespace: `${this.#namespace}:merged`,
      seed: this.#seed + 42n,
      maxSize: this.#items.size + incoming.length,
    });
    return catalog as unknown as MeshSignalCatalog<
      Merge<TCatalog, TIncoming> extends SignalCatalogItem[] ? Merge<TCatalog, TIncoming> : SignalCatalogItem[]
    >;
  };

  mapRecords = <T>(mapper: (item: SignalCatalogItem) => T): readonly T[] =>
    Array.from(this.#items.values()).map(mapper).toSorted();

  planRoutes = (
    topology: MeshTopology,
    runId: MeshRunId,
    prefix: string,
  ): SignalCatalogSearchResult => {
    const route = Array.from(this.#items.values()).map((item, index): SignalPathRecord => ({
      route: `${prefix}/${index}`,
      path: `${item.kind}:${topology.id}:${index}:${runId}` as MeshTopologyPath,
      labels: item.labels,
    }));

    return {
      node: route,
      score: Math.min(route.length, 8),
      labels: this.labels(),
    };
  };

  toMap = (): MapFromItems<TCatalog> => {
    const out = {} as MapFromItems<TCatalog>;
    for (const item of this.#items.values()) {
      (out as Record<string, TCatalog[number]>)[item.id] = item as TCatalog[number];
    }
    return out;
  };

  private normalizeTokens(items: readonly string[], seed: bigint): readonly string[] {
    return items
      .map((item) => `${seed.toString(16)}:${item}`)
      .toSorted();
  }
}

const priorityRank = (priority: MeshPriority): number => {
  if (priority === 'critical') {
    return 3;
  }
  if (priority === 'high') {
    return 2;
  }
  if (priority === 'normal') {
    return 1;
  }
  return 0;
};

export type SignalCatalogSnapshot = {
  readonly id: string;
  readonly size: number;
  readonly kinds: MeshSignalKind[];
  readonly labels: readonly string[];
};

const catalogSeedSchema = z.array(entrySchema).min(1).max(200);

function entriesToTuple<T extends SignalCatalogItem[]>(entries: T): T {
  return entries;
}

export const catalogEntry = <TKind extends MeshSignalKind>(
  kind: NoInfer<TKind>,
  payload: MeshPayloadFor<TKind>,
): SignalCatalogItem<TKind> => ({
  id: withBrand(`seed-${randomUUID()}`, 'MeshSignalCatalogItemId'),
  kind,
  priority: 'normal',
  labels: ['generated'],
  payload,
  key: `mesh-catalog:${kind}:${randomUUID()}` as SignalEnvelopeKey<TKind>,
  createdAt: Date.now(),
});

export const extractRouteToken = <
  TNodes extends readonly string[],
  TItems extends readonly string[],
>(
  _nodes: NoInfer<TNodes>,
  tokens: NoInfer<TItems>,
): readonly SignalRouteKey<MeshSignalKind, TItems>[] =>
  tokens.map((token) => `pulse:${token}:${tokens.length}` as SignalRouteKey<MeshSignalKind, TItems>);

export const catalogPath = <T extends readonly string[]>(
  seed: NoInfer<T>,
): RouteValuePath => seed.map((part) => part);

export const catalogRoutesFromPath = <T extends readonly string[]>(
  seed: NoInfer<T>,
): RouteValuePath => [...seed].reverse().map((token) => `${token}`);

export const catalogRuntimeToken = <T extends string>(seed: NoInfer<T>): Brand<string, 'MeshSignalCatalogState'> =>
  `${seed}-${Date.now()}` as Brand<string, 'MeshSignalCatalogState'>;

export const catalogTemplate = <TTopology extends string>(topologyId: TTopology): SignalCatalogSearchResult => ({
  node: [
    {
      route: `catalog:${topologyId}`,
      path: `${topologyId}:template` as MeshTopologyPath,
      labels: ['template'],
    },
  ],
  score: 1,
  labels: ['template'],
});
