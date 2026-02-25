import {
  asNamespace,
  asWindow,
  type AnalyticsWindow,
} from './identifiers';
import { asSignalAlias } from './models';
import {
  buildTopologyFromPlugins,
  normalizeTopologyNodes,
} from './plugin-topology';
import {
  pluginCatalogToMap,
  pluginCatalogSeedNodes,
  pluginRouteSignature,
  type PluginNode,
  type PluginRouteSignature,
  type PluginRunInput,
  type PluginRunResult,
} from './typed-plugin-types';

export type CatalogCategory = 'platform' | 'workflow' | 'policy' | 'telemetry' | 'fabric';

export interface PluginCatalogManifest<TName extends string = string> {
  readonly id: `catalog:${string}`;
  readonly version: `catalog:${number}`;
  readonly createdAt: string;
  readonly category: CatalogCategory;
  readonly checksum: `checksum:${string}`;
  readonly plugins: readonly PluginNode['name'][];
  readonly route: PluginRouteSignature<readonly PluginNode[]>;
}

export interface CatalogSlot<TPayload = unknown> {
  readonly id: `slot:${string}`;
  readonly name: string;
  readonly payload: TPayload;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly pinned: boolean;
}

export interface PluginCatalogStateDescriptor {
  readonly manifest: PluginCatalogManifest;
  readonly slots: readonly CatalogSlot[];
  readonly map: ReturnType<typeof pluginCatalogToMap>;
  readonly signature: PluginRouteSignature<readonly PluginNode[]>;
  readonly topology: ReturnType<typeof buildTopologyFromPlugins>;
}

export type PluginCatalogState = PluginCatalogStateDescriptor;

type CatalogSeedPlugin = PluginNode<'catalog-seeder', 'seed', PluginRunInput, PluginRunResult>;

const pluginSeed: readonly CatalogSeedPlugin[] = [
  {
    name: 'plugin:catalog-seeder',
    namespace: 'namespace:platform',
    kind: 'plugin:seed',
    dependsOn: [] as const,
    inputKinds: ['in:seed'] as const,
    outputKinds: ['out:seed'] as const,
    weight: 1,
    signature: 'catalog-seeder',
    version: 'v1',
    metadata: {
      owner: 'recovery-ecosystem',
      domain: 'catalog',
      createdAt: new Date().toISOString(),
      tags: ['seed', 'platform', 'catalog'],
    },
    run: async (input) => ({
      plugin: 'plugin:catalog-seeder',
      accepted: true,
      signalCount: 1,
      payload: input.payload,
      diagnostics: [{ step: 'catalog-seed', latencyMs: 3 }],
    }),
  },
];

const createCatalogSlotTags = (index: number): readonly string[] => [
  `seed:${index}`,
  'runtime',
  `generated:${index % 4}`,
];

const templateManifest = {
  category: 'platform' as const,
  version: 'catalog:1' as const,
  checksum: 'checksum:initial' as const,
};

const normalizeSlotSeed = (entry: PluginNode): `signal:${string}` =>
  `signal:${entry.name.replace('plugin:', '')}` as `signal:${string}`;

const resolveCatalogSignalSeed = (entry: PluginNode): ReturnType<typeof normalizeSlotSeed> =>
  `signal:${entry.name.replace('plugin:', '').replace(/[^a-z0-9._-]+/g, '-')}`;

export const pluginCatalogManifest = (seed: string): PluginCatalogManifest<'recovery-ecosystem'> => {
  const routeSeed = pluginRouteSignature([...pluginCatalogSeedNodes]);
  return {
    id: `catalog:${seed}`,
    version: templateManifest.version,
    createdAt: new Date().toISOString(),
    category: templateManifest.category,
    checksum: `checksum:${seed}` as const,
    plugins: [...pluginCatalogSeedNodes].map((entry) => entry.name),
    route: routeSeed,
  };
};

export const catalogSeedSlots = <T extends readonly PluginNode[]>(
  plugins: T,
): readonly CatalogSlot[] =>
  plugins.map((entry, index) => ({
    id: `slot:${index}`,
    name: entry.name,
    payload: {
      namespace: entry.namespace,
      kind: entry.kind,
      signature: entry.signature,
      route: normalizeSlotSeed(entry),
    },
    aliases: [asSignalAlias(entry.name.replace('plugin:', ''))],
    tags: createCatalogSlotTags(index),
    pinned: true,
  }));

export const buildCatalogState = <TPlugins extends readonly PluginNode[]>(
  plugins: TPlugins,
  category: CatalogCategory = templateManifest.category,
): PluginCatalogStateDescriptor => {
  const normalized = normalizeTopologyNodes(plugins);
  const manifestSeed = `manifest-${category}`;
  const manifest = pluginCatalogManifest(manifestSeed);
  const topology = buildTopologyFromPlugins(normalized, {
    includeDetached: true,
    allowCycles: false,
    maxDepth: 14,
  });

  return {
    manifest: {
      ...manifest,
      category,
      plugins: [...normalized.map((entry) => entry.name)],
      route: pluginRouteSignature(normalized),
    },
    slots: normalized.flatMap((entry, index) =>
      catalogSeedSlots([entry]).filter((slot) => {
        slot.aliases.includes(resolveCatalogSignalSeed(entry));
        return true;
      }).map((slot) => ({ ...slot, pinned: index % 2 === 0 })),
    ),
    map: pluginCatalogToMap(normalized),
    signature: pluginRouteSignature(normalized),
    topology,
  };
};

export const pluginSeedCatalogState = (): PluginCatalogStateDescriptor =>
  buildCatalogState([...pluginCatalogSeedNodes], 'platform');

export const resolveCatalogSession = (tenant: string, namespace: string): ReturnType<typeof asNamespace> =>
  asNamespace(`catalog:${tenant}:${namespace}`);

export const resolveCatalogWindow = (seed: string): ReturnType<typeof asWindow> => asWindow(`window:${seed}`);

export const resolveCatalogSignal = (entry: PluginNode): ReturnType<typeof normalizeSlotSeed> =>
  resolveCatalogSignalSeed(entry);

export const catalogRecordAlias = (tenant: string, namespace: string): ReturnType<typeof asSignalAlias> =>
  asSignalAlias(`${tenant}:${namespace}`);

export const catalogRecordNamespace = (namespace: string): ReturnType<typeof asNamespace> => asNamespace(namespace);

export const pluginCatalogStateFromContext = (
  tenant: string,
  namespace: string,
): {
  readonly tenant: ReturnType<typeof asNamespace>;
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly window: AnalyticsWindow;
  readonly manifest: PluginCatalogManifest;
} => ({
  tenant: asNamespace(`tenant:${tenant}`),
  namespace: asNamespace(`namespace:${namespace}`),
  window: resolveCatalogWindow(tenant),
  manifest: pluginCatalogManifest(`${tenant}:${namespace}`),
});
