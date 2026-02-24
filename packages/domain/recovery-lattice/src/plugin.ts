import { NoInfer } from '@shared/type-level';
import type { BrandedTimestamp, LatticePluginId } from './ids';

export const pluginKindCatalog = ['ingest', 'transform', 'route', 'emit', 'observe'] as const;
export type PluginKind = (typeof pluginKindCatalog)[number];
export type PluginStatus = 'available' | 'warming' | 'active' | 'degraded' | 'retired';
export type PluginChannel<K extends PluginKind = PluginKind> = `${K}::${string}`;

export interface PluginContext {
  readonly requestId: BrandedTimestamp;
  readonly namespace: string;
  readonly tags: readonly string[];
}

export interface PluginResult<T = unknown> {
  readonly status: PluginStatus;
  readonly payload: T;
  readonly warnings: readonly string[];
}

export interface PluginEnvelope<
  I = unknown,
  O = unknown,
  K extends PluginKind = PluginKind,
> {
  readonly name: string;
  readonly kind: K;
  readonly version: `v${number}.${number}.${number}`;
  readonly id: LatticePluginId;
  readonly scope: PluginChannel<K>;
  readonly description: string;
  readonly metadata: Readonly<Record<string, string>>;
  execute(input: I, context: NoInfer<PluginContext>): Promise<PluginResult<O>>;
}

export type PluginByKind<
  TSchema extends readonly PluginEnvelope[],
  TKind extends PluginKind,
> = Extract<TSchema[number], { kind: TKind }>;

export type PluginEnvelopeMap<TMap extends readonly PluginEnvelope[]> = {
  [K in TMap[number] as K['scope']]: K;
};

export type PluginNameMap<TMap extends readonly PluginEnvelope[]> = {
  [K in TMap[number] as `plugin:${K['name']}`]: K;
};

export interface RegistrySnapshot<TSchema extends readonly PluginEnvelope[]> {
  readonly active: readonly TSchema[number][];
  readonly byKind: { [K in PluginKind]: readonly PluginByKind<TSchema, K>[] };
  readonly total: number;
}

export interface PluginRegistrationConfig {
  readonly allowOverride: boolean;
  readonly maxVersion: number;
}

export const normalizeKinds = (kinds: readonly string[]): readonly string[] =>
  kinds.map((kind) => kind.trim().toLowerCase());

type KindBuckets<TSchema extends readonly PluginEnvelope[]> = {
  [K in PluginKind]: readonly PluginByKind<TSchema, K>[];
};

export class LatticePluginRegistry<const TSchema extends readonly PluginEnvelope[]> {
  #entries = new Map<string, TSchema[number]>();
  #status = new Map<string, PluginStatus>();

  constructor(
    private readonly entries: readonly TSchema[number][],
    private readonly config: PluginRegistrationConfig = { allowOverride: false, maxVersion: 9 },
  ) {
    const normalized = normalizeKinds(entries.map((entry) => entry.name));
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const norm = normalized[index];
      const key = `${entry.kind}::${norm}`;
      if (!this.config.allowOverride && this.#entries.has(key)) {
        continue;
      }
      const descriptor = {
        ...entry,
        status: 'available' as PluginStatus,
      };
      this.#entries.set(key, descriptor as TSchema[number]);
      this.#status.set(entry.name, descriptor.status);
    }
  }

  list(): readonly TSchema[number][] {
    return [...this.#entries.values()];
  }

  listByKind<TKind extends PluginKind>(kind: TKind): readonly PluginByKind<TSchema, TKind>[] {
    return [...this.#entries.values()].filter(
      (entry): entry is PluginByKind<TSchema, TKind> => entry.kind === kind,
    );
  }

  resolve<TKind extends PluginKind>(kind: TKind, name: string): readonly PluginByKind<TSchema, TKind>[] {
    return this.listByKind(kind).filter((entry) => entry.name === name);
  }

  find(name: string): TSchema[number] | undefined {
    return this.#entries.get(name) ?? this.#entries.get(this.normalizeScope(name));
  }

  setStatus(name: string, status: PluginStatus): void {
    const entry = this.find(name);
    if (!entry) return;
    this.#status.set(entry.name, status);
    const updated = {
      ...entry,
      status,
    };
    this.#entries.set(this.normalizeScope(entry.name), updated as TSchema[number]);
  }

  snapshot(): RegistrySnapshot<TSchema> {
    const byKind: KindBuckets<TSchema> = {
      route: this.listByKind('route'),
      observe: this.listByKind('observe'),
      transform: this.listByKind('transform'),
      ingest: this.listByKind('ingest'),
      emit: this.listByKind('emit'),
    };

    return {
      active: this.list(),
      byKind,
      total: this.#entries.size,
    };
  }

  private normalizeScope(value: string): string {
    return `${value}`;
  }
}

export const makePluginEnvelope = async <
  TInput,
  TOutput,
  TKind extends PluginKind,
>(
  id: string,
  name: string,
  kind: TKind,
  namespace: string,
  version: number,
  execute: (input: TInput, context: PluginContext) => Promise<PluginResult<TOutput>>,
): Promise<PluginEnvelope<TInput, TOutput, TKind>> => ({
  id: `${namespace}::${id}` as LatticePluginId,
  name,
  kind,
  version: `v${version}.0.0`,
  scope: `${kind}::${namespace}`,
  description: `${kind} plugin ${name}`,
  metadata: {
    namespace,
    name,
    kind,
  },
  execute,
});

export const pluginKindSet = new Set<PluginKind>(pluginKindCatalog);
