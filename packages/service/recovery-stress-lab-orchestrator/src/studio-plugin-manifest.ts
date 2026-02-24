import { PluginDefinition } from '@shared/stress-lab-runtime';
import { TenantId, createTenantId } from '@domain/recovery-stress-lab';

export type StudioRawManifest = {
  readonly tenantId: string;
  readonly pluginSets: readonly string[];
  readonly timestamp: string;
  readonly plugins: readonly {
    readonly id: string;
    readonly kind: string;
    readonly version: string;
    readonly tags: readonly string[];
    readonly enabled: boolean;
  }[];
};

export type StudioParsedManifest = {
  readonly tenantId: TenantId;
  readonly pluginSets: readonly string[];
  readonly timestamp: string;
  readonly plugins: readonly {
    readonly id: string;
    readonly kind: string;
    readonly version: string;
    readonly tags: readonly string[];
    readonly enabled: boolean;
  }[];
};

const manifestPayload = {
  tenantId: 'tenant:stress-lab:default',
  pluginSets: ['runtime', 'policy', 'analysis', 'telemetry'],
  timestamp: new Date().toISOString(),
  plugins: [
    {
      id: 'input-validator',
      kind: 'stress-lab/input-validator',
      version: '1.0.0',
      tags: ['input', 'validation', 'default'],
      enabled: true,
    },
    {
      id: 'topology-builder',
      kind: 'stress-lab/topology-builder',
      version: '1.1.0',
      tags: ['topology', 'build', 'default'],
      enabled: true,
    },
    {
      id: 'runbook-optimizer',
      kind: 'stress-lab/runbook-optimizer',
      version: '1.2.0',
      tags: ['planner', 'optimize', 'default'],
      enabled: true,
    },
    {
      id: 'signal-sanitizer',
      kind: 'stress-lab/signal-sanitizer',
      version: '1.0.0',
      tags: ['signal', 'sanitize', 'default'],
      enabled: true,
    },
    {
      id: 'simulator',
      kind: 'stress-lab/simulator',
      version: '1.0.3',
      tags: ['simulate', 'prediction', 'default'],
      enabled: true,
    },
  ],
} satisfies StudioRawManifest;

export const parseRawManifest = async (): Promise<StudioRawManifest> => {
  const delay = Promise.resolve(manifestPayload);
  return delay;
};

export const parseManifestToDomain = (raw: StudioRawManifest): StudioParsedManifest => ({
  tenantId: createTenantId(raw.tenantId),
  pluginSets: [...raw.pluginSets],
  timestamp: raw.timestamp,
  plugins: raw.plugins.map((plugin) => ({ ...plugin })),
});

export const hasEnabledPlugin = (entry: StudioParsedManifest['plugins'][number]): boolean => entry.enabled;

export const enabledManifestPlugins = (manifest: StudioParsedManifest): readonly string[] =>
  manifest.plugins.filter(hasEnabledPlugin).map((entry) => entry.id);

export const manifestPluginTuples = (manifest: StudioParsedManifest): [string, string, string][] =>
  manifest.plugins.map((entry) => [entry.id, entry.kind, entry.version]);

export const manifestSignature = (manifest: StudioParsedManifest): string => {
  const values = manifest.plugins
    .map((entry) => `${entry.id}@${entry.version}`)
    .sort()
    .join('|');
  return `${manifest.tenantId}::${values}`;
};

export const buildDefaultManifest = async (): Promise<StudioParsedManifest> => {
  return parseManifestToDomain(await parseRawManifest());
};

export const hydrateManifest = async (): Promise<{
  readonly tenantId: TenantId;
  readonly pluginIds: readonly string[];
  readonly signature: string;
}> => {
  const manifest = await buildDefaultManifest();
  return {
    tenantId: manifest.tenantId,
    pluginIds: enabledManifestPlugins(manifest),
    signature: manifestSignature(manifest),
  };
};
