export interface ContractVersion {
  id: string;
  major: number;
  minor: number;
  patch: number;
}

export interface VersionedContract extends ContractVersion {
  changedAt: string;
  notes: string[];
}

export const bumpMajor = (value: ContractVersion): ContractVersion => ({
  ...value,
  major: value.major + 1,
  minor: 0,
  patch: 0,
});

export const bumpMinor = (value: ContractVersion): ContractVersion => ({
  ...value,
  minor: value.minor + 1,
  patch: 0,
});

export const bumpPatch = (value: ContractVersion): ContractVersion => ({
  ...value,
  patch: value.patch + 1,
});

export const fromString = (raw: string): ContractVersion => {
  const [major, minor, patch] = raw.split('.').map((item) => Number(item));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
};

export const toString = (value: ContractVersion): string => `${value.major}.${value.minor}.${value.patch}`;
