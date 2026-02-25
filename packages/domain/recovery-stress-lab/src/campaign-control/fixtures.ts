import {
  CampaignRoute,
  createCampaignBundleId,
  createCampaignId,
  type CampaignId,
  type CampaignSeed,
  type CampaignSeedWindow,
} from './types';
import { createSignalId, createTenantId, type RecoverySignalId, type TenantId } from '../models';

interface CampaignFixtureSeedInput {
  readonly tenantIdLabel: string;
  readonly campaignIdLabel: string;
  readonly title: string;
  readonly windows: readonly CampaignSeedWindow[];
  readonly route: CampaignRoute<string> | readonly string[];
  readonly labels: readonly string[];
  readonly requiredSignals: readonly RecoverySignalId[];
  readonly expectedDurationMinutes: number;
}

const signalIds = {
  latency: createSignalId('seed-latency'),
  cpu: createSignalId('seed-cpu'),
  queue: createSignalId('seed-queue'),
  database: createSignalId('seed-database'),
  storage: createSignalId('seed-storage'),
  connection: createSignalId('seed-connection'),
} as const;

const tenantAlpha: TenantId = createTenantId('tenant-alpha');
const tenantBravo: TenantId = createTenantId('tenant-bravo');
const tenantCharlie: TenantId = createTenantId('tenant-charlie');

const fixtureDefinitions = [
  {
    tenantIdLabel: String(tenantAlpha),
    campaignIdLabel: 'alpha-blueprint',
    title: 'alpha-latency-observation',
    windows: [
      { index: 0, durationMinutes: 8, intensity: 0.42 },
      { index: 1, durationMinutes: 11, intensity: 0.68 },
      { index: 2, durationMinutes: 14, intensity: 0.77 },
    ],
    route: ['discovery', 'modeling', 'orchestration'],
    labels: ['primary', 'automated', 'alpha'],
    requiredSignals: [signalIds.latency, signalIds.cpu],
    expectedDurationMinutes: 78,
  },
  {
    tenantIdLabel: String(tenantBravo),
    campaignIdLabel: 'bravo-resilience',
    title: 'bravo-db-reliability',
    windows: [
      { index: 0, durationMinutes: 10, intensity: 0.54 },
      { index: 1, durationMinutes: 18, intensity: 0.81 },
      { index: 2, durationMinutes: 22, intensity: 0.94 },
    ],
    route: ['discovery', 'simulation', 'verification'],
    labels: ['secondary', 'bravo'],
    requiredSignals: [signalIds.database],
    expectedDurationMinutes: 92,
  },
  {
    tenantIdLabel: String(tenantCharlie),
    campaignIdLabel: 'charlie-storage',
    title: 'charlie-storage-fidelity',
    windows: [
      { index: 0, durationMinutes: 13, intensity: 0.51 },
      { index: 1, durationMinutes: 16, intensity: 0.71 },
    ],
    route: ['discovery', 'orchestration'],
    labels: ['stable', 'charlie'],
    requiredSignals: [signalIds.storage, signalIds.connection],
    expectedDurationMinutes: 95,
  },
] as const satisfies readonly CampaignFixtureSeedInput[];

const mapFixture = (seed: CampaignFixtureSeedInput): CampaignSeed => {
  const tenantId = seed.tenantIdLabel as TenantId;
  const campaignId = createCampaignId(tenantId, seed.campaignIdLabel);

  return {
    tenantId,
    campaignId,
    title: seed.title,
    bundleId: createCampaignBundleId(tenantId, `${seed.campaignIdLabel}-bundle`),
    windows: [...seed.windows],
    route: [...seed.route],
    labels: [...seed.labels],
    requiredSignals: [...seed.requiredSignals],
    expectedDurationMinutes: seed.expectedDurationMinutes,
  };
};

const rawCampaignSeeds = fixtureDefinitions.map(mapFixture);

export interface CampaignFixtureSeedShape extends Omit<CampaignSeed, 'campaignId' | 'tenantId' | 'bundleId'> {
  readonly tenantIdLabel: string;
  readonly campaignIdLabel: string;
}

export const campaignFixtureCatalog = rawCampaignSeeds.map((seed, index) => {
  const fixture = fixtureDefinitions[index];
  return {
    tenantIdLabel: fixture.tenantIdLabel,
    campaignIdLabel: fixture.campaignIdLabel,
    tenantId: seed.tenantId,
    campaignId: seed.campaignId,
    title: seed.title,
    bundleId: seed.bundleId,
    windows: [...seed.windows],
    route: [...seed.route],
    labels: [...seed.labels],
    requiredSignals: [...seed.requiredSignals],
    expectedDurationMinutes: seed.expectedDurationMinutes,
  };
}) satisfies readonly CampaignFixtureSeedShape[];

export const campaignFixtures = campaignFixtureCatalog.map((seed) => ({
  tenantId: seed.tenantId,
  campaignId: seed.campaignId,
  title: seed.title,
  bundleId: seed.bundleId,
  windows: [...seed.windows],
  route: [...seed.route],
  labels: [...seed.labels],
  requiredSignals: [...seed.requiredSignals],
  expectedDurationMinutes: seed.expectedDurationMinutes,
})) satisfies readonly CampaignSeed[];

export const campaignFixtureByTenant = (tenantId: TenantId): readonly CampaignSeed[] =>
  campaignFixtures.filter((seed) => seed.tenantId === tenantId);

export const campaignFixtureTitles = campaignFixtures.map((seed) => seed.title);

export const campaignRouteSignatures = campaignFixtures.map((seed) => ({
  campaignId: seed.campaignId,
  signature: `${seed.tenantId}::${seed.bundleId}::${seed.title}` as string,
}));

export const seedCampaignSignals = campaignFixtures
  .flatMap((seed) => seed.requiredSignals)
  .toSorted((left, right) => String(left).localeCompare(String(right)));

export type CampaignFixture = CampaignSeed;

export const hasSeedForCampaign = (tenantId: TenantId, campaignId: string): boolean =>
  campaignFixtures.some((seed) => String(seed.tenantId) === String(tenantId) && String(seed.campaignId) === campaignId);

export const estimateFixtureDuration = (campaignId: string): number => {
  const seed = campaignFixtures.find((item) => String(item.campaignId) === campaignId);
  if (!seed) {
    return 0;
  }
  return seed.windows.reduce((total, window) => total + window.durationMinutes, 0);
};
