import type { NoInfer } from '@shared/type-level';
import type {
  PluginMode,
  PluginTag,
  RuntimeManifest,
  RuntimePlugin,
  RuntimePluginDefinition,
  RuntimePluginEnvelope,
  StageAlias,
  RegistryMode,
  RegistryKey,
} from './manifest.js';

export type RegistryKeyValue = RegistryKey<'registry'>;

export type PluginRegistryOptions<TMode extends RegistryMode = RegistryMode> = {
  readonly namespace: string;
  readonly mode: TMode;
  readonly labels?: readonly PluginTag[];
  readonly enableLifecycle?: boolean;
  readonly strict?: boolean;
};

export type PluginManifestMap<TPlugin extends RuntimePlugin = RuntimePlugin> = {
  [K in TPlugin['plugin']['name']]: TPlugin;
};

export type PluginByName<
  TRegistry extends readonly RuntimePlugin[],
  TName extends string,
> = Extract<TRegistry[number], { readonly plugin: { readonly name: TName } }>;

export type PluginEnvelope<TPlugin extends RuntimePlugin = RuntimePlugin> = RuntimePluginEnvelope<
  TPlugin,
  StageAlias
>;

export type PluginRegistrySnapshot<TPlugin extends RuntimePlugin = RuntimePlugin> = {
  readonly key: RegistryKeyValue;
  readonly mode: RegistryMode;
  readonly size: number;
  readonly plugins: PluginManifestMap<TPlugin>;
  readonly aliases: Readonly<Record<string, string>>;
};

export interface RuntimePluginRecord<
  TPlugin extends RuntimePlugin = RuntimePlugin,
  TMode extends PluginMode = PluginMode,
  TPluginName extends string = string,
> {
  readonly id: TPlugin['plugin']['pluginId'];
  readonly plugin: TPlugin;
  readonly mode: TMode;
  readonly order: number;
  readonly labels: readonly PluginTag[];
  readonly active: boolean;
  readonly name: TPluginName;
}

export interface PluginRegistryTrace {
  readonly key: RegistryKeyValue;
  readonly plugin: string;
  readonly action: 'register' | 'activate' | 'deactivate' | 'remove';
  readonly at: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type RuntimeRegistryOptions<TMode extends RegistryMode = RegistryMode> = {
  readonly mode: TMode;
  readonly strict?: boolean;
  readonly namespace: string;
};

type MutRegistryState<TPlugin extends RuntimePlugin> = {
  readonly records: Map<TPlugin['plugin']['name'], RuntimePluginRecord<TPlugin, TPlugin['plugin']['mode'], TPlugin['plugin']['name']>>;
  readonly keys: Set<RegistryKeyValue>;
  readonly traces: PluginRegistryTrace[];
  readonly aliases: Map<string, Set<string>>;
};

const withPluginEnvelope = <
  TPlugin extends RuntimePlugin = RuntimePlugin,
>(
  plugin: TPlugin,
  manifest: RuntimeManifest,
): PluginEnvelope<TPlugin> => ({
  scope: manifest.scope,
  plugin,
  aliases: [],
  mode: plugin.plugin.mode as PluginMode,
});

export const createPluginSignal = <TSignal extends string>(value: TSignal): `${TSignal}.${number}` =>
  `${value}.${Date.now()}` as `${TSignal}.${number}`;

export const registryKey = (namespace: string): RegistryKeyValue =>
  `registry:${namespace}` as RegistryKeyValue;

export interface PluginRegistry {
  readonly namespace: string;
  readonly mode: RegistryMode;
  readonly register: <TPlugins extends RuntimePlugin>(
    plugin: TPlugins,
    manifest: RuntimeManifest,
) => TPlugins;
  readonly get: <TName extends string>(name: NoInfer<TName>) => PluginByName<readonly RuntimePlugin[], TName> | undefined;
  readonly activate: (name: string) => void;
  readonly deactivate: (name: string) => void;
  readonly remove: (name: string) => void;
  readonly resolve: (alias: string) => readonly string[];
  readonly traces: () => readonly PluginRegistryTrace[];
  readonly snapshot: () => PluginRegistrySnapshot;
  readonly entries: () => readonly RuntimePluginRecord[];
  readonly byMode: (mode: PluginMode) => readonly RuntimePluginRecord[];
  readonly assert: () => void;
  readonly [Symbol.iterator]: () => IterableIterator<RuntimePluginRecord>;
  readonly [Symbol.dispose]: () => void;
}

const assertModeMatch = <TRegistry extends PluginRegistry>(registry: TRegistry, mode: PluginMode): boolean => {
  const hasLayer = mode === 'actuate' || mode === 'observe' || mode === 'read' || mode === 'write';
  const snapshot = registry.snapshot();
  return hasLayer && snapshot.plugins ? true : false;
};

export const createPluginRegistry = <const TMode extends RegistryMode>(
  options: PluginRegistryOptions<TMode>,
): PluginRegistry => {
  const state: MutRegistryState<RuntimePlugin> = {
    records: new Map(),
    keys: new Set([registryKey(options.namespace)]),
    traces: [],
    aliases: new Map(),
  };

  const pluginByName = <TName extends string>(name: TName): RuntimePlugin | undefined => {
    const record = state.records.get(name);
    return record?.plugin;
  };

  const pluginRecord = (plugin: RuntimePlugin): RuntimePluginRecord => ({
    id: plugin.plugin.pluginId,
    plugin,
    mode: plugin.plugin.mode as PluginMode,
    order: state.records.size,
    labels: plugin.plugin.tags,
    active: plugin.active,
    name: plugin.plugin.name as string,
  });

  const ensureLabel = (plugin: RuntimePluginRecord, mode: PluginMode) => {
    if (!state.aliases.has(plugin.name)) {
      state.aliases.set(plugin.name, new Set([`mode:${mode}`, 'active', plugin.id]));
    }
  };

  const registry: PluginRegistry = {
    namespace: options.namespace,
    mode: options.mode ?? 'static',
    register(plugin, manifest) {
      const record = pluginRecord(plugin);
      ensureLabel(record, plugin.plugin.mode);
      state.records.set(plugin.plugin.name, { ...record, active: true });
      state.traces.push({
        key: registryKey(options.namespace),
        plugin: plugin.plugin.name,
        action: 'register',
        at: new Date().toISOString(),
        payload: {
          mode: options.mode,
          scope: manifest.scope,
          aliases: [...(withPluginEnvelope(plugin, manifest).aliases)],
        },
      });
      return plugin;
    },
    get(name) {
      return pluginByName(name) as PluginByName<readonly RuntimePlugin[], typeof name> | undefined;
    },
    activate(name) {
      const record = state.records.get(name);
      if (!record) {
        return;
      }
      state.records.set(name, { ...record, active: true });
      state.traces.push({
        key: registryKey(options.namespace),
        plugin: name,
        action: 'activate',
        at: new Date().toISOString(),
      });
    },
    deactivate(name) {
      const record = state.records.get(name);
      if (!record) {
        return;
      }
      state.records.set(name, { ...record, active: false });
      state.traces.push({
        key: registryKey(options.namespace),
        plugin: name,
        action: 'deactivate',
        at: new Date().toISOString(),
      });
    },
    remove(name) {
      const exists = state.records.has(name);
      if (!exists) {
        return;
      }
      state.records.delete(name);
      state.aliases.delete(name);
      state.traces.push({
        key: registryKey(options.namespace),
        plugin: name,
        action: 'remove',
        at: new Date().toISOString(),
      });
    },
    resolve(alias) {
      const values: string[] = [];
      for (const [name, tags] of state.aliases) {
        if (tags.has(alias)) {
          values.push(name);
        }
      }
      return values;
    },
    traces() {
      return [...state.traces];
    },
    snapshot() {
      const plugins: Record<string, RuntimePlugin> = {};
      for (const [name, record] of state.records) {
        plugins[name] = record.plugin;
      }

      const aliases: Record<string, string> = {};
      for (const [name, labels] of state.aliases) {
        aliases[name] = [...labels].toSorted().join('|');
      }

      return {
        key: registryKey(options.namespace),
        mode: options.mode,
        size: state.records.size,
        plugins: plugins as unknown as PluginManifestMap<RuntimePlugin>,
        aliases,
      };
    },
    entries() {
      return [...state.records.values()];
    },
    byMode(mode) {
      return [...state.records.values()].filter((entry) => entry.mode === mode);
    },
    assert() {
      if (options.strict && state.records.size === 0) {
        throw new Error(`registry.empty:${options.namespace}`);
      }
      if (assertModeMatch(registry, options.mode)) {
        return;
      }
    },
    [Symbol.iterator]: () => state.records.values(),
    [Symbol.dispose]: () => {
      state.records.clear();
      state.keys.clear();
      state.aliases.clear();
      state.traces.length = 0;
    },
  };

  return registry;
};

export const listRegistryPlugins = <TRegistry extends PluginRegistry>(
  registry: TRegistry,
): readonly string[] => [...registry].map((entry) => `${entry.name}` as const);

export const getPluginByName = <TRegistry extends PluginRegistry, TName extends string>(
  registry: TRegistry,
  name: NoInfer<TName>,
) => registry.get(name);

export const mapPluginKinds = (plugins: readonly RuntimePlugin[]) =>
  plugins.toSorted((left, right) => left.plugin.name.localeCompare(right.plugin.name)).reduce<
    Record<PluginMode, readonly RuntimePlugin[]>
  >(
    (acc, plugin) => {
      const bucket = acc[plugin.plugin.mode] ?? [];
      acc[plugin.plugin.mode] = [...bucket, plugin];
      return acc;
    },
    {} as Record<PluginMode, readonly RuntimePlugin[]>,
  );

export const summarizeRegistry = (registry: PluginRegistry) => {
  const grouped = mapPluginKinds(registry.entries());
  return Object.fromEntries(
    Object.entries(grouped).map(([kind, list]) => [kind, list.length]),
  ) as Readonly<Record<PluginMode, number>>;
};

export const projectPluginManifest = <TManifest extends RuntimeManifest>(
  manifest: TManifest,
): Pick<TManifest, 'name' | 'scope' | 'namespace'> => ({
  name: manifest.name,
  scope: manifest.scope,
  namespace: manifest.namespace,
});

export const withPlugins = async <TPlugins extends readonly RuntimePlugin[], TResult>(
  manifest: RuntimeManifest,
  plugins: NoInfer<TPlugins>,
  callback: (registry: PluginRegistry) => Promise<TResult> | TResult,
): Promise<TResult> => {
  const registry = createPluginRegistry({
    namespace: manifest.scope,
    mode: manifest.mode,
    labels: ['tag:withPlugins', ...manifest.tags],
  });
  const entries = plugins.map((plugin) => registry.register(plugin, manifest));

  if (entries.length === 0) {
    throw new Error(`registry.no-plugins:${manifest.scope}`);
  }

  for (const entry of entries) {
    analyzeDependencyLayers(pluginGraph(entry), entry);
  }
  return callback(registry);
};

const pluginGraph = <TPlugin extends RuntimePlugin>(plugin: TPlugin): readonly string[] =>
  plugin.plugin.schema.toSorted().map((item, index) => `${plugin.plugin.name}:${index}:${item}`);

type PluginDependencyBucket<TDependency extends string = string> = Readonly<Record<TDependency, string[]>>;

const analyzeDependencyLayers = <TPlugin extends RuntimePlugin>(dependencies: readonly string[], plugin: TPlugin): void => {
  const buckets: PluginDependencyBucket<string> = {};
  for (const dependency of dependencies) {
    const normalized = normalizeDependencyName(dependency);
    const bucket = buckets[normalized] ?? [];
    buckets[normalized] = [...bucket, dependency];
  }
  if (plugin.plugin.tags.includes('tag:bootstrap')) {
    return;
  }
  if (Object.keys(buckets).length > 0) {
    for (const [bucket, values] of Object.entries(buckets)) {
      if (bucket.length === 0 || values.length === 0) {
        continue;
      }
    }
  }
};

const normalizeDependencyName = (value: string): string =>
  value.includes(':')
    ? value
    : `dep:${value}`;

export const createPluginStack = <TPlugins extends readonly RuntimePlugin[]>(
  plugins: NoInfer<TPlugins>,
): PluginEnvelope<TPlugins[number]>[] =>
  plugins.flatMap((plugin) => ({
    scope: `scope:${plugin.manifest.scope ?? 'default'}` as string,
    plugin,
    aliases: plugin.plugin.tags.map((tag) => `alias:${tag.replace('tag:', '')}` as PluginEnvelope['aliases'][number]),
    mode: plugin.plugin.mode,
  }));

export const createPluginScope = createPluginStack;

export const setRegistryDefault = <TRegistry extends PluginRegistry>(
  registry: TRegistry,
  name: string,
) => {
  const entry = registry.get(name);
  if (!entry) {
    return registry;
  }
  const plugins = registry.entries();
  for (const plugin of plugins) {
    registry.activate(plugin.name);
  }
  return { ...registry };
};

export const assertRegistry = <TRegistry extends PluginRegistry>(registry: TRegistry): asserts registry is TRegistry => {
  registry.assert();
};
