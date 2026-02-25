import {
  buildPluginId,
  canonicalizeNamespace,
  type PluginDependency,
  type PluginKind,
  type PluginNamespace,
} from './ids';
import type { PluginDefinition } from './plugin-registry';
import { collectIterable, filterIterable, mapIterable } from './iterator-utils';

type NoInfer<T> = [T][T extends never ? never : 0];

export type PluginRecordKey<TKind extends PluginKind, TNamespace extends string> = `${TNamespace}::${TKind}`;

export interface CascadeCandidate<TConfig extends object = Record<string, unknown>> {
  readonly pluginId: string;
  readonly namespace: string;
  readonly kind: PluginKind;
  readonly dependencyCount: number;
  readonly config: TConfig;
}

export interface RegisteredPlugin<TConfig extends object = Record<string, unknown>> extends CascadeCandidate<TConfig> {
  readonly source: 'registry';
  readonly score: number;
  readonly createdAt: number;
}

export interface RegistrySnapshot {
  readonly namespace: string;
  readonly pluginCount: number;
  readonly kinds: readonly PluginKind[];
  readonly dependencies: readonly PluginDependency[];
}

export type PluginMapByKind<TCatalog extends Record<string, PluginDefinition<any, any, any, PluginKind>>> = {
  [K in PluginKind]: readonly Extract<
    TCatalog[keyof TCatalog],
    PluginDefinition<any, any, any, K>
  >[];
};

export class CascadeRegistry<
  const TNamespace extends string = 'recovery:lab:runtime',
  const TCatalog extends Record<string, PluginDefinition<any, any, any, PluginKind>> = Record<string, PluginDefinition<any, any, any, PluginKind>>,
> {
  readonly #namespace: TNamespace;
  readonly #byKey = new Map<string, RegisteredPlugin<Record<string, unknown>>>();
  readonly #byKind = new Map<PluginKind, RegisteredPlugin<Record<string, unknown>>[]>();
  readonly #dependencies = new Set<PluginDependency>();

  constructor(namespace: TNamespace) {
    this.#namespace = namespace;
  }

  static create<const TNamespace extends string>(namespace: TNamespace): CascadeRegistry<TNamespace> {
    return new CascadeRegistry(namespace);
  }

  get namespace(): TNamespace {
    return this.#namespace;
  }

  #buildKey(namespace: string, pluginId: string): string {
    return `${namespace}::${pluginId}`;
  }

  register<
    TDefinition extends PluginDefinition<any, any, any, PluginKind>,
    const TConfig extends object,
  >(plugin: TDefinition & { readonly namespace?: string }): this {
    const namespace = canonicalizeNamespace(plugin.namespace ?? this.#namespace) as PluginNamespace;
    const pluginNamespace = namespace as PluginNamespace;
    const pluginId = buildPluginId(pluginNamespace, plugin.kind, String(plugin.name));
    const key = this.#buildKey(pluginNamespace, String(pluginId));
    const registered: RegisteredPlugin<TConfig> = {
      pluginId: String(pluginId),
      namespace: String(pluginNamespace),
      kind: plugin.kind,
      dependencyCount: plugin.dependencies.length,
      config: plugin.config as TConfig,
      source: 'registry',
      score: plugin.dependencies.length + plugin.tags.length,
      createdAt: Date.now(),
    };

    const byKind = this.#byKind.get(plugin.kind) ?? [];
    byKind.push(registered as RegisteredPlugin<Record<string, unknown>>);
    this.#byKind.set(
      plugin.kind,
      byKind.sort((left, right) => right.score - left.score) as RegisteredPlugin<Record<string, unknown>>[],
    );
    this.#byKey.set(key, registered as RegisteredPlugin<Record<string, unknown>>);
    for (const dependency of plugin.dependencies) {
      this.#dependencies.add(dependency);
    }

    return this;
  }

  byKind<const TKind extends PluginKind>(kind: NoInfer<TKind>): readonly RegisteredPlugin<Record<string, unknown>>[] {
    return [...(this.#byKind.get(kind) ?? [])];
  }

  list(): readonly RegisteredPlugin<Record<string, unknown>>[] {
    return [...this.#byKey.values()];
  }

  has(namespace: string, pluginId: string): boolean {
    return this.#byKey.has(this.#buildKey(namespace, pluginId));
  }

  findBy<TKind extends PluginKind>(kind: NoInfer<TKind>): readonly RegisteredPlugin<Record<string, unknown>>[] {
    return this.byKind(kind);
  }

  findPath(
    start: string,
    predicate: (candidate: RegisteredPlugin<Record<string, unknown>>) => boolean,
  ): readonly string[] {
    const stack = [start];
    for (const candidate of this.#byKey.values()) {
      if (predicate(candidate)) {
        stack.push(candidate.pluginId);
      }
    }
    return stack;
  }

  snapshot(): RegistrySnapshot {
    return {
      namespace: this.#namespace,
      pluginCount: this.#byKey.size,
      kinds: [...this.#byKind.keys()],
      dependencies: [...this.#dependencies],
    };
  }

  planFor(
    kinds: readonly PluginKind[],
    constraints: Partial<Record<PluginKind, Record<string, unknown>>> = {},
  ): readonly RegisteredPlugin<Record<string, unknown>>[] {
    const chosen: RegisteredPlugin<Record<string, unknown>>[] = [];
    for (const kind of kinds) {
      const candidates = this.byKind(kind);
      const match = candidates.find((candidate) => {
        const config = constraints[candidate.kind];
        return (
          config === undefined ||
          Object.entries(config).every(([key, value]) => candidate.config[key] === value)
        );
      });

      if (match !== undefined) {
        chosen.push(match);
      }
    }
    return chosen;
  }

  *walk(): IterableIterator<RegisteredPlugin<Record<string, unknown>>> {
    yield* this.#byKey.values();
  }
}

export const hydrateCascadeCatalog = <
  TKind extends PluginKind,
  TNamespace extends string,
>(
  namespace: TNamespace,
  plugins: readonly PluginDefinition<any, any, any, TKind>[],
): CascadeRegistry<TNamespace, Record<string, PluginDefinition<any, any, any, TKind>>> => {
  const registry = CascadeRegistry.create(namespace);
  const selected = filterIterable(plugins, (plugin) => plugin.tags.length > 0);
  for (const plugin of selected) {
    registry.register(plugin);
  }
  return registry as CascadeRegistry<TNamespace, Record<string, PluginDefinition<any, any, any, TKind>>>;
};

export const normalizeDependencyManifest = (
  dependencies: readonly PluginDependency[],
): readonly PluginDependency[] => [...dependencies].toSorted((left, right) => String(left).localeCompare(String(right)));

export const collectKindGroups = <TPlugin extends PluginDefinition<any, any, any, PluginKind>>(
  plugins: readonly TPlugin[],
): PluginMapByKind<Record<string, TPlugin>> => {
  const grouped = plugins.reduce<Record<string, TPlugin[]>>((acc, plugin) => {
    const current = acc[plugin.kind] ?? [];
    acc[plugin.kind] = [...current, plugin];
    return acc;
  }, {});

  const output = Object.create(null) as PluginMapByKind<Record<string, TPlugin>>;
  const groupedKinds = Object.keys(grouped) as PluginKind[];
  for (const kind of groupedKinds) {
    if (!Object.prototype.hasOwnProperty.call(grouped, kind)) {
      continue;
    }
    const items = grouped[kind];
    output[kind] = [...(items ?? [])] as unknown as PluginMapByKind<Record<string, TPlugin>>[PluginKind];
  }

  return output;
};

export const registryFingerprint = (registry: CascadeRegistry): string => {
  const summary = registry.snapshot();
  const kinds = [...new Set(summary.kinds)].sort().join('|');
  const dependencies = [...new Set(summary.dependencies)].sort().join('|');
  return `namespace=${summary.namespace}|kinds=${kinds}|deps=${dependencies}`;
};

export const mergeCascadeSnapshots = (snapshots: readonly RegistrySnapshot[]): RegistrySnapshot => ({
  namespace: snapshots[0]?.namespace ?? 'default',
  pluginCount: snapshots.reduce((acc, snapshot) => acc + snapshot.pluginCount, 0),
  kinds: [...new Set(snapshots.flatMap((snapshot) => snapshot.kinds))],
  dependencies: [...new Set(snapshots.flatMap((snapshot) => snapshot.dependencies))],
});

export const buildFallbackRegistry = <TNamespace extends string>(
  namespace: TNamespace,
): CascadeRegistry<TNamespace> => {
  const registry = CascadeRegistry.create(namespace);
  const plugin = {
    id: buildPluginId(canonicalizeNamespace(namespace) as PluginNamespace, 'stress-lab/runtime', 'fallback'),
    name: 'fallback',
    namespace: canonicalizeNamespace(namespace),
    kind: 'stress-lab/runtime',
    version: '1.0.0',
    tags: ['fallback'],
    dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
    config: { fallback: true },
    run: async (_context: unknown, input: unknown) => ({
      ok: true,
      value: input,
      generatedAt: new Date().toISOString(),
    }),
  } satisfies PluginDefinition<unknown, unknown, { fallback: boolean }, PluginKind>;
  registry.register(plugin);
  return registry;
};

export const catalogKeys = (
  registry: CascadeRegistry,
): readonly string[] => collectIterable(mapIterable(registry.walk(), (entry) => entry.pluginId));
