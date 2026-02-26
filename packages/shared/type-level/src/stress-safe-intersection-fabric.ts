export interface BlueprintAlpha {
  readonly alpha: number;
  readonly alphaVersion: 'A';
}

export interface BlueprintBeta {
  readonly beta: string;
  readonly betaMode: 'B';
}

export interface BlueprintGamma {
  readonly gamma: boolean;
  readonly gammaEnabled: true;
}

export type DisjointIntersectionBundle<
  A extends BlueprintAlpha,
  B extends BlueprintBeta,
  C extends BlueprintGamma,
> =
  A & B & C;

export type CatalogBlueprint = DisjointIntersectionBundle<BlueprintAlpha, BlueprintBeta, BlueprintGamma>;

export type BlueprintShard<T extends string> = T extends `A${infer R}`
  ? { readonly alphaShard: T; readonly label: `alpha-${R}` }
  : T extends `B${infer R}`
    ? { readonly betaShard: T; readonly label: `beta-${R}` }
    : { readonly gammaShard: T; readonly label: `gamma-${T}` };

export type BranchProfile<T extends { readonly alpha?: number; readonly beta?: string; readonly gamma?: boolean }> =
  & (T extends { readonly alpha: number }
    ? { readonly alphaTag: `alpha-${T['alpha']}` }
    : { readonly alphaTag: 'alpha-missing' })
  & (T extends { readonly beta: string }
    ? { readonly betaTag: `beta-${T['beta']}` }
    : { readonly betaTag: 'beta-missing' })
  & (T extends { readonly gamma: boolean }
    ? { readonly gammaTag: `gamma-${T['gamma'] extends true ? 'on' : 'off'}` }
    : { readonly gammaTag: 'gamma-missing' });

export const catalogTemplates = [
  {
    alpha: 1,
    alphaVersion: 'A',
    beta: 'north',
    betaMode: 'B',
    gamma: true,
    gammaEnabled: true,
  } as const,
  {
    alpha: 2,
    alphaVersion: 'A',
    beta: 'south',
    betaMode: 'B',
    gamma: false,
    gammaEnabled: true,
  } as const,
] satisfies readonly CatalogBlueprint[];

export type BundleByMode<T extends readonly string[]> =
  T extends readonly [infer H, ...infer R]
    ? H extends string
      ? BlueprintShard<H> & BundleByMode<Extract<R, readonly string[]>>
      : BundleByMode<Extract<R, readonly string[]>>
    : {};

export type BundleResolver<T extends readonly string[]> =
  T extends readonly string[] ? BundleByMode<T> : never;

export const buildBundle = <T extends readonly string[]>(identifiers: T): BundleResolver<T> => {
  const output: { [key: string]: unknown } = {};

  for (const token of identifiers) {
    const key = token.startsWith('A') ? 'alpha' : token.startsWith('B') ? 'beta' : 'gamma';
    output[key] = token;
  }

  return output as BundleResolver<T>;
};

export type CatalogByTenant<T extends string> =
  T extends `tenant-${infer Region}`
    ? {
      readonly tenant: T;
      readonly region: Region;
      readonly active: boolean;
    }
    : never;

export type IntersectedCatalog<TRegion extends string> = CatalogByTenant<`tenant-${TRegion}`> & {
  readonly partition: TRegion;
};

export type CatalogBuilder = CatalogBlueprint;
export type CatalogSignatureEntry = IntersectedCatalog<string>;

export const asBundle = <T extends string>(tenant: `tenant-${T}`): IntersectedCatalog<T> => ({
  tenant,
  region: tenant.replace('tenant-', '') as T,
  active: tenant.includes('north'),
  partition: tenant.replace('tenant-', '') as T,
} as unknown as IntersectedCatalog<T>);

export const unionCatalog = [
  asBundle('tenant-north'),
  asBundle('tenant-south'),
  asBundle('tenant-east'),
] as const;

export type CatalogSignature<T extends readonly IntersectedCatalog<string>[]> = {
  readonly domains: T[number]['tenant'];
  readonly regions: T[number]['region'];
};

export const catalogSignature = (items: readonly IntersectedCatalog<string>[]): CatalogSignature<typeof unionCatalog> => {
  const domains = items.map((item) => item.tenant);
  const regions = items.map((item) => item.region);
  return {
    domains: domains[0] ?? '',
    regions: regions[0] ?? '',
  } as CatalogSignature<typeof unionCatalog>;
};
