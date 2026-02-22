export interface FeatureValue {
  enabled: boolean;
  percent: number;
  rolloutAt?: string;
}

export interface FeatureFlag {
  key: string;
  value: FeatureValue;
  owner: string;
  description?: string;
}

export interface FlagCatalog {
  namespace: string;
  flags: FeatureFlag[];
}

export const toEnabled = (flag: FeatureFlag, userId: string): boolean => {
  if (!flag.value.enabled) return false;
  if (flag.value.percent <= 0) return false;
  if (flag.value.percent >= 100) return true;
  const bucket = hash(userId) % 100;
  return bucket < flag.value.percent;
};

const hash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
  }
  return Math.abs(hash);
};

export const upsert = (catalog: FlagCatalog, flag: FeatureFlag): FlagCatalog => {
  const idx = catalog.flags.findIndex((item) => item.key === flag.key);
  if (idx === -1) return { ...catalog, flags: [...catalog.flags, flag] };
  const flags = catalog.flags.slice();
  flags[idx] = flag;
  return { ...catalog, flags };
};

export const merge = (left: FlagCatalog, right: FlagCatalog): FlagCatalog => {
  const next = [...left.flags];
  for (const flag of right.flags) {
    const idx = next.findIndex((item) => item.key === flag.key);
    if (idx === -1) next.push(flag); else next[idx] = flag;
  }
  return { namespace: left.namespace, flags: next };
};
