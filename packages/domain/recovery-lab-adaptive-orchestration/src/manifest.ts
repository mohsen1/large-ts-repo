import { parseCampaignManifest, type CampaignManifestRecord } from './schema';
import { automationPluginCatalog, automationCatalogNamespace, type CatalogPhase } from './plugin-catalog';

const seedManifest = {
  tenantId: 'tenant:recovery-lab-adaptive',
  campaignId: 'campaign:adaptive-lab',
  planId: 'plan:adaptive-lab-bootstrap',
  runMode: 'simulate',
  stages: ['ingest', 'plan', 'execute', 'verify', 'synthesize'],
  activeSteps: {
    ingest: 1,
    plan: 2,
    execute: 3,
    verify: 4,
    synthesize: 5,
  },
  labels: ['adaptive', 'typescript', 'lab'],
  tags: {
    namespace: automationCatalogNamespace,
    phase: 'plan',
  },
  createdBy: 'bootstrap',
  createdAt: new Date().toISOString(),
} as const;

export const builtInManifest: CampaignManifestRecord = parseCampaignManifest(seedManifest);

export const namespaceToCatalogPhases = Array.from(new Set(
  automationPluginCatalog.phases.reduce<readonly CatalogPhase[]>((acc, plugin) => {
    if (acc.includes(plugin.stage)) {
      return acc;
    }
    return [...acc, plugin.stage];
  }, []),
));

export const isManifestForTenant = (manifest: CampaignManifestRecord, tenantId: string): boolean => manifest.tenantId === tenantId;

export const hasRunMode = (manifest: CampaignManifestRecord, mode: string): boolean => manifest.runMode === mode;

export const manifestRuntimeLabel = (manifest: CampaignManifestRecord): string =>
  `${manifest.tenantId}/${manifest.campaignId}/${manifest.runMode}`;
