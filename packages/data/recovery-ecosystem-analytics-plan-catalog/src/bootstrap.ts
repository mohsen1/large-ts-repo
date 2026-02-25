import { asCatalogId, asCatalogNamespace, asCatalogTenant, asCatalogWindow, catalogPlanFromPhases, catalogPlanFingerprint, buildCatalogSlot } from './contracts';
import type { PlanCatalogRecord } from './contracts';
import { buildCatalogCatalogRecord } from './contracts';

const buildSeedRecords = (count: number): readonly PlanCatalogRecord[] => {
  const maxSeeds = Math.max(0, count);
  const seeds = ['fabric-core', 'stress-lab', 'policy-plane', 'signal-mesh'].slice(0, maxSeeds || 4);
  return seeds.map((seed) => {
    const tenant = `tenant:${seed}`;
    const namespace = `namespace:${seed}`;
    const signalKinds = ['normalize', 'evaluate', 'publish', 'forecast', 'archive'];
    const plan = catalogPlanFromPhases(seed, seed, signalKinds);
    const catalogRecord = buildCatalogCatalogRecord(plan, tenant, namespace, 'seed');
    return {
      ...catalogRecord,
      tags: [catalogRecord.tags[0], `tag:${seed}`, `tag:bootstrap-${seed}`] as const,
      labels: [catalogRecord.labels[0], `label:${seed}`] as const,
    };
  });
};

export const defaultCatalogRecords = buildSeedRecords(4);

export type DefaultCatalogRecords = typeof defaultCatalogRecords;
