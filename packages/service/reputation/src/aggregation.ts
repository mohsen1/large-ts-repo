import { RiskProfile } from '@domain/risk/scores';

export type Distribution = Record<string, number>;

export const byTenant = (profiles: readonly RiskProfile[]): Distribution => {
  const out: Distribution = {};
  for (const profile of profiles) {
    out[profile.tenantId] = (out[profile.tenantId] ?? 0) + profile.score;
  }
  return out;
};

export const normalize = (dist: Distribution): Distribution => {
  const max = Math.max(1, ...Object.values(dist));
  const out: Distribution = {};
  for (const [key, value] of Object.entries(dist)) {
    out[key] = value / max;
  }
  return out;
};

export const topTenants = (dist: Distribution, limit: number): [string, number][] => {
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
};
