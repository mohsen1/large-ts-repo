import { chain } from './iterable';
import type { PluginId } from './identity';
import type { OrchestrationPlugin } from './plugin-registry';
import { withSyncScope } from './disposable-scope';

export interface PluginManifestRecord {
  readonly id: PluginId;
  readonly namespace: string;
  readonly version: string;
  readonly phase: 'init' | 'plan' | 'execute' | 'observe' | 'finalize';
  readonly tags: readonly string[];
  readonly description: string;
}

interface PluginManifestSeed {
  readonly pluginId: PluginId;
  readonly namespace: string;
  readonly version: string;
  readonly phase: 'init' | 'plan' | 'execute' | 'observe' | 'finalize';
  readonly tags: readonly string[];
}

const manifestSeed = [
  {
    pluginId: 'recoveryscope:topology' as PluginId,
    namespace: 'topology',
    version: '2026.01.01',
    phase: 'init' as const,
    tags: ['topology', 'precondition'],
  },
  {
    pluginId: 'recoveryscope:policy' as PluginId,
    namespace: 'policy',
    version: '2026.01.01',
    phase: 'plan' as const,
    tags: ['policy', 'safeguard'],
  },
  {
    pluginId: 'recoveryscope:mitigate' as PluginId,
    namespace: 'mitigation',
    version: '2026.01.01',
    phase: 'execute' as const,
    tags: ['mitigation', 'repair'],
  },
  {
    pluginId: 'recoveryscope:drain' as PluginId,
    namespace: 'drain',
    version: '2026.01.01',
    phase: 'execute' as const,
    tags: ['drain', 'safety'],
  },
  {
    pluginId: 'recoveryscope:verify' as PluginId,
    namespace: 'verification',
    version: '2026.01.01',
    phase: 'observe' as const,
    tags: ['verify', 'postcondition'],
  },
  {
    pluginId: 'recoveryscope:resolve' as PluginId,
    namespace: 'resolution',
    version: '2026.01.01',
    phase: 'finalize' as const,
    tags: ['resolve', 'audit'],
  },
 ] as const satisfies readonly PluginManifestSeed[];

const manifestDescriptionSuffix = (seeds: readonly PluginManifestSeed[]) =>
  chain(seeds)
    .map((seed: PluginManifestSeed) => `${seed.namespace}/${seed.phase}`)
    .toArray()
    .join(',');

const mapSeedToRecord = (seed: PluginManifestSeed): PluginManifestRecord => ({
  id: seed.pluginId,
  namespace: seed.namespace,
  version: seed.version,
  phase: seed.phase,
  tags: seed.tags,
  description: `default-plugin:${seed.namespace} (${seed.version}) [${manifestDescriptionSuffix(manifestSeed)}]`,
});

export const manifestRecords = withSyncScope(() => {
  return manifestSeed.map((seed: PluginManifestSeed) => mapSeedToRecord(seed));
});

export const manifestMap = new Map<PluginId, PluginManifestRecord>(
  manifestRecords.map((record: PluginManifestRecord) => [record.id, record] as const),
);

export const listManifests = (): readonly PluginManifestRecord[] => [...manifestRecords];

export const toPluginRecords = (plugins: Iterable<OrchestrationPlugin>): readonly PluginManifestRecord[] =>
  chain(plugins)
    .map((plugin: OrchestrationPlugin) => ({
      id: plugin.id,
      namespace: plugin.namespace,
      version: plugin.version,
      phase: plugin.phase,
      tags: plugin.tags,
      description: plugin.description,
    }))
    .toArray();
