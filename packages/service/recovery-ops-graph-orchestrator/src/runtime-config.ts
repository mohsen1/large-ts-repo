import type { ProfileHint, ProfileId } from '@domain/recovery-ops-orchestration-graph';

export interface RuntimeProfileConfig {
  readonly profileId: ProfileId;
  readonly profileName: string;
  readonly strictness: number;
  readonly tags: readonly string[];
}

const seedProfiles: readonly RuntimeProfileConfig[] = [
  {
    profileId: 'tenant-primary:v1' as ProfileId,
    profileName: 'tenant-primary',
    strictness: 7,
    tags: ['tenant', 'default'],
  },
  {
    profileId: 'ops-latency:v1' as ProfileId,
    profileName: 'ops-latency',
    strictness: 9,
    tags: ['ops', 'latency'],
  },
  {
    profileId: 'global-observability:v2' as ProfileId,
    profileName: 'global-observability',
    strictness: 6,
    tags: ['global', 'platform'],
  },
] as const;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const bootstrapPromise = delay(10).then(async () => ({
  tenantDefaults: seedProfiles,
  operatorDefaults: [seedProfiles[1]],
  globalDefaults: [seedProfiles[2]],
  bootstrapMs: 20,
}));

export const getRuntimeProfiles = async () => bootstrapPromise;

export const getProfile = (profileId: string): ProfileHint => {
  const profile =
    seedProfiles.find((entry) => entry.profileId === (profileId as ProfileId)) ??
    seedProfiles[2];

  return {
    profileId: profile.profileId,
    profileName: profile.profileName,
    strictness: profile.strictness,
    tags: [...profile.tags],
  } satisfies ProfileHint;
};

export const getProfilesByTag = (tag: string): readonly RuntimeProfileConfig[] =>
  seedProfiles.filter((entry) => entry.tags.includes(tag));

export const describeProfiles = () =>
  seedProfiles.map((entry) => ({
    profileId: entry.profileId,
    profileName: entry.profileName,
    strictness: entry.strictness,
    tags: [...entry.tags],
  }));
