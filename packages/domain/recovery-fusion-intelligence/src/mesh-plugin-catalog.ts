import {
  asMeshEventId,
  asMeshNodeId,
  asMeshRunId,
  type MeshManifestEntry,
  type MeshNode,
  type MeshPhase,
  type MeshPluginName,
  type MeshRunId,
  type MeshPriority,
  type MeshRuntimeEvent,
  type MeshSignalEnvelope,
} from './mesh-types';

export type CatalogIndex<T extends readonly MeshManifestEntry[]> = {
  readonly [K in T[number] as K['name']]: K;
};

export type PluginManifestMap<T extends readonly MeshManifestEntry[]> = {
  readonly [K in T[number] as K['pluginId']]: K;
};

export interface PluginCatalogEntry {
  readonly manifest: MeshManifestEntry;
  readonly loadedAt: string;
  readonly priority: MeshPriority;
}

export type CatalogHealth = 'green' | 'yellow' | 'red';

export interface CatalogSnapshot {
  readonly id: MeshRunId;
  readonly entries: readonly PluginCatalogEntry[];
  readonly phases: readonly MeshPhase[];
  readonly health: CatalogHealth;
}

export interface PluginEnvelope {
  readonly plugin: MeshManifestEntry;
  readonly dependencies: readonly MeshPluginName[];
  readonly tags: readonly string[];
}

const toCatalogHealth = (entries: readonly PluginCatalogEntry[]): CatalogHealth => {
  const avgPriority = entries.reduce((acc, entry) => acc + entry.priority, 0) / entries.length || 0;
  return avgPriority >= 4 ? 'red' : avgPriority >= 2.5 ? 'yellow' : 'green';
};

export const buildPluginIndex = <T extends readonly MeshManifestEntry[]>(plugins: T): CatalogIndex<T> =>
  plugins.reduce<CatalogIndex<T>>(
    (acc, plugin) => ({
      ...acc,
      [plugin.name]: plugin,
    }),
    {} as CatalogIndex<T>,
  );

export const buildPluginIdIndex = <T extends readonly MeshManifestEntry[]>(plugins: T): PluginManifestMap<T> =>
  plugins.reduce<PluginManifestMap<T>>(
    (acc, plugin) => ({
      ...acc,
      [plugin.pluginId]: plugin,
    }),
    {} as PluginManifestMap<T>,
  );

export const normalizeCatalogEntries = (plugins: readonly MeshManifestEntry[]): readonly PluginCatalogEntry[] =>
  plugins
    .toSorted((left, right) => right.priority - left.priority)
    .map((manifest, index) => ({
      manifest,
      loadedAt: new Date(Date.now() - index * 17_000).toISOString(),
      priority: manifest.priority,
    }))
    .toSorted((left, right) => left.loadedAt.localeCompare(right.loadedAt));

export const asPluginCatalogEnvelope = (entry: MeshManifestEntry): PluginEnvelope => ({
  plugin: entry,
  dependencies: [...entry.dependencies],
  tags: entry.tags,
});

export const buildCatalogSnapshot = (
  runId: MeshRunId,
  manifests: readonly MeshManifestEntry[],
  phases: readonly MeshPhase[],
): CatalogSnapshot => {
  const entries = normalizeCatalogEntries(manifests);
  return {
    id: runId,
    entries: Object.freeze(entries),
    phases,
    health: toCatalogHealth(entries),
  };
};

export const catalogWarnings = (manifest: MeshManifestEntry): readonly MeshRuntimeEvent[] => [
  {
    runId: asMeshRunId('catalog', String(manifest.name)),
    phase: 'observe',
    marker: 'phase:observe',
    payload: {
      plugin: manifest.name,
      namespace: manifest.namespace,
      tags: manifest.tags,
    },
  },
];

export const reconcileCatalog = (
  local: readonly MeshManifestEntry[],
  remote: readonly MeshManifestEntry[],
): readonly MeshManifestEntry[] =>
  Object.values(
    [...local, ...remote].reduce<Record<MeshPluginName, MeshManifestEntry>>((acc, manifest) => {
      if (!(manifest.name in acc) || manifest.priority >= acc[manifest.name].priority) {
        acc[manifest.name] = manifest;
      }
      return acc;
    }, {}),
  );

export const extractSignals = (envelopes: readonly PluginEnvelope[]): readonly MeshSignalEnvelope[] =>
  envelopes.flatMap((envelope, index) =>
    envelope.tags.map((tag, tagIndex) => ({
      id: asMeshEventId(asMeshRunId('catalog', String(envelope.plugin.name)), 'normalize', index * 3 + tagIndex),
      phase: 'normalize',
      source: asMeshNodeId(`catalog-${String(envelope.plugin.pluginId)}:${tag}`),
      class: 'baseline',
      severity: (Math.min(5, envelope.tags.length + index) % 6) as 0 | 1 | 2 | 3 | 4 | 5,
      payload: {
        pluginName: envelope.plugin.name,
        tags: envelope.tags,
        tag,
      },
      createdAt: new Date().toISOString(),
    })),
  );

export const pluginByDependency = (plugins: readonly PluginEnvelope[], dependency: MeshPluginName): readonly PluginEnvelope[] =>
  plugins.filter((plugin) => plugin.dependencies.includes(dependency));

export const buildPluginFingerprint = (manifest: MeshManifestEntry): string => {
  const namespaceSeed = `${manifest.namespace}:${manifest.version}`;
  const pluginTags = manifest.tags.join('|');
  const seed = `${manifest.name}|${manifest.versionLock}|${manifest.priority}|${pluginTags}`;
  return `${namespaceSeed}|${seed}`.toLowerCase();
};

export const adaptPluginManifest = (manifest: MeshManifestEntry): MeshManifestEntry => ({
  ...manifest,
  tags: manifest.tags.toSorted(),
});

export const collectManifestNodes = (manifests: readonly MeshManifestEntry[]): readonly MeshNode[] =>
  manifests.toSorted((left, right) => left.name.localeCompare(right.name)).map((manifest, index) => ({
    id: asMeshNodeId(`${manifest.pluginId}-${index}`),
    role: index % 4 === 0 ? 'source' : index % 4 === 1 ? 'transform' : index % 4 === 2 ? 'aggregator' : 'sink',
    score: Math.max(0, Math.min(1, manifest.priority / 5)),
    phase: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'][index % 6] as MeshPhase,
    active: manifest.dependencies.length > 0,
    metadata: {
      plugin: manifest.name,
      tags: manifest.tags,
      run: manifest.version,
    },
  }));
