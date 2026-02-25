import type {
  CascadeBlueprint,
  CascadePolicyTemplate,
  PolicyCatalogName,
  PolicyId,
  RegistryTag,
  StageNameFromManifest,
} from './types.js';
import { normalizePolicyTemplate } from './types.js';

export type PolicyCatalogKind = 'policy-catalog';
export type PolicyCatalogVersion = `v${number}.${number}.${number}`;
export type CatalogFilter = Readonly<{
  readonly namespace?: PolicyCatalogName;
  readonly policyIds?: readonly PolicyId[];
  readonly labels?: readonly string[];
  readonly minStageCount?: number;
}>;

export interface PolicyCatalog {
  readonly kind: PolicyCatalogKind;
  readonly id: PolicyCatalogName;
  readonly title: string;
  readonly version: PolicyCatalogVersion;
  readonly labels: readonly string[];
  readonly policyCount: number;
  readonly stageCount: number;
  readonly updatedAt: string;
}

export interface PolicyCatalogPolicy<
  TBlueprint extends CascadeBlueprint = CascadeBlueprint,
  TTemplate extends CascadePolicyTemplate = CascadePolicyTemplate,
> {
  readonly catalog: PolicyCatalog;
  readonly blueprint: TBlueprint;
  readonly template: TTemplate;
  readonly policyId: PolicyId;
  readonly namespaceTag: RegistryTag;
}

export type PolicyCatalogIndex<TBlueprint extends CascadeBlueprint = CascadeBlueprint> = {
  readonly byPolicy: Readonly<Record<PolicyId, PolicyCatalogPolicy<TBlueprint>>>;
  readonly byTitle: Readonly<Record<string, readonly PolicyCatalogPolicy<TBlueprint>[]>>;
};

const normalizeTitle = (value: string): string => value.trim().toLowerCase().replace(/[\s_]+/g, '-');

const formatLabel = (label: string): `catalog:${string}` => `catalog:${label}`;

export const buildCatalogSignature = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): string =>
  `${blueprint.namespace}:${blueprint.policyId}:${blueprint.stages.length}`;

export const buildCatalogConfig = <
  TBlueprint extends CascadeBlueprint,
>(
  blueprint: TBlueprint,
  override: Partial<Pick<PolicyCatalog, 'labels' | 'version'>>,
): PolicyCatalog => ({
  kind: 'policy-catalog',
  id: `catalog:${blueprint.namespace}` as PolicyCatalogName,
  title: normalizeTitle(blueprint.namespace),
  version: (override.version ?? 'v1.0.0') as PolicyCatalogVersion,
  labels: [...new Set([`catalog:${blueprint.riskBand}`, ...(override.labels ?? [])].filter(Boolean))],
  policyCount: 1,
  stageCount: blueprint.stages.length,
  updatedAt: new Date().toISOString(),
});

export const buildCatalogMeta = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Pick<PolicyCatalogPolicy<TBlueprint>, 'catalog' | 'policyId' | 'namespaceTag'> => {
  const catalog = buildCatalogConfig(blueprint, {
    labels: ['meta', 'runtime', `tenant:${blueprint.tenant.id}`],
  });
  return {
    catalog,
    policyId: blueprint.policyId,
    namespaceTag: `registry:${blueprint.policyId}` as RegistryTag,
  };
};

export const asPolicyCatalog = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): PolicyCatalogPolicy<TBlueprint> => {
  const catalog = buildCatalogConfig(blueprint, {
    labels: ['policy', blueprint.namespaceTag],
  });
  const namespaceTag = `registry:${blueprint.policyId}` as RegistryTag;
  return {
    catalog,
    blueprint,
    template: normalizePolicyTemplate({
      policyId: blueprint.policyId,
      name: blueprint.namespace,
      namespace: blueprint.namespaceTag.replace(/^policy:/, ''),
      blueprint,
      constraints: [],
      thresholds: {
        'threshold.latency': 250,
        'threshold.error': 0.02,
      },
    }),
    policyId: blueprint.policyId,
    namespaceTag,
  };
};

export const normalizeCatalogScope = (value: string): PolicyCatalogName =>
  `catalog:${value}` as PolicyCatalogName;

export const toCatalogNamespace = normalizeCatalogScope;

export const mapPluginKinds = (names: readonly string[]): Readonly<Record<string, readonly string[]>> => {
  const output: Record<string, string[]> = {};
  for (const name of names) {
    const [kind] = name.split('.');
    const bucket = output[kind] ?? [];
    output[kind] = [...bucket, name];
  }
  return output as Readonly<Record<string, readonly string[]>>;
};

export const catalogPlugins = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): readonly string[] =>
  [...new Set(blueprint.stages.toSorted((left, right) => left.name.localeCompare(right.name)).map((stage) => stage.name))];

export const expandPolicyLabels = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): readonly RegistryTag[] =>
  blueprint.stages
    .flatMap((stage) => stage.dependencies)
    .map((dependency) => `registry:${dependency}` as RegistryTag)
    .toSorted((left, right) => left.localeCompare(right));

export const mapPolicyOwners = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Readonly<Record<PolicyId, readonly string[]>> => {
  const labels = [blueprint.namespaceTag, blueprint.riskBand, blueprint.tenant.id] as const;
  return {
    [blueprint.policyId]: labels,
  };
};

export const indexByStage = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint) => {
  const output: Record<StageNameFromManifest<TBlueprint>, readonly PolicyId[]> = {} as Record<
    StageNameFromManifest<TBlueprint>,
    readonly PolicyId[]
  >;
  for (const stage of blueprint.stages) {
    output[stage.name as StageNameFromManifest<TBlueprint>] = [blueprint.policyId];
  }
  return output;
};

export const indexPolicyByTitle = <TBlueprint extends CascadeBlueprint>(
  policies: readonly PolicyCatalogPolicy<TBlueprint>[],
): Readonly<Record<string, readonly PolicyCatalogPolicy<TBlueprint>[]>> => {
  const output: Record<string, PolicyCatalogPolicy<TBlueprint>[]> = {};
  for (const policy of policies) {
    const key = String(policy.catalog.title);
    output[key] = [...(output[key] ?? []), policy];
  }
  return output as Readonly<Record<string, readonly PolicyCatalogPolicy<TBlueprint>[]>>;
};

export const indexCatalog = <TBlueprint extends CascadeBlueprint>(
  policies: readonly PolicyCatalogPolicy<TBlueprint>[],
): PolicyCatalogIndex<TBlueprint> => {
  const byTitle = indexPolicyByTitle(policies);
  const byPolicy = policies.reduce<Record<PolicyId, PolicyCatalogPolicy<TBlueprint>>>((acc, policy) => {
    acc[policy.policyId] = policy;
    return acc;
  }, {} as Record<PolicyId, PolicyCatalogPolicy<TBlueprint>>);

  return {
    byPolicy,
    byTitle,
  };
};

export const mergeCatalog = <TBlueprint extends CascadeBlueprint>(
  left: PolicyCatalogPolicy<TBlueprint>[],
  right: PolicyCatalogPolicy<TBlueprint>[],
): PolicyCatalogPolicy<TBlueprint>[] => {
  const seen = new Set<PolicyId>();
  const output: PolicyCatalogPolicy<TBlueprint>[] = [];
  for (const entry of [...left, ...right]) {
    if (seen.has(entry.policyId)) {
      continue;
    }
    seen.add(entry.policyId);
    output.push(entry);
  }
  return output;
};

export const configurePolicyCatalog = <TBlueprint extends CascadeBlueprint>(
  blueprints: readonly TBlueprint[],
  filters: CatalogFilter = {},
): PolicyCatalogPolicy<TBlueprint>[] => {
  const configured = blueprints.map((entry) => asPolicyCatalog(entry) as PolicyCatalogPolicy<TBlueprint>);
  const minimum = Math.max(0, filters.minStageCount ?? 0);
  return configured.filter((entry) => {
    if (filters.namespace !== undefined && entry.catalog.id !== filters.namespace) {
      return false;
    }
    if (filters.policyIds !== undefined && !filters.policyIds.includes(entry.policyId)) {
      return false;
    }
    if (filters.labels !== undefined && filters.labels.some((label) => !entry.catalog.labels.includes(formatLabel(label)))) {
      return false;
    }
    if (entry.catalog.stageCount < minimum) {
      return false;
    }
    return true;
  });
};

export const resolvePolicies = <TBlueprint extends CascadeBlueprint>(
  catalogs: readonly PolicyCatalogPolicy<TBlueprint>[],
  policyIds: readonly PolicyId[],
): PolicyCatalogPolicy<TBlueprint>[] =>
  catalogs.filter((entry) => policyIds.includes(entry.policyId));

export const buildFallbackCatalog = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  fallbackTitle?: string,
): PolicyCatalogPolicy<TBlueprint> => {
  const catalog = buildCatalogConfig(blueprint, {
    labels: ['fallback', fallbackTitle ?? 'default'],
  });
  return {
    catalog,
    blueprint,
    template: normalizePolicyTemplate({
      policyId: blueprint.policyId,
      name: `${fallbackTitle ?? 'fallback'}:${blueprint.namespace}`,
      namespace: blueprint.namespaceTag.replace(/^policy:/, ''),
      blueprint,
      constraints: [],
      thresholds: {
        'threshold.latency': 500,
        'threshold.error': 0.1,
      },
    }),
    policyId: blueprint.policyId,
    namespaceTag: `registry:${blueprint.policyId}` as RegistryTag,
  };
};

export const configurePolicyCatalogByNamespace = <TBlueprint extends CascadeBlueprint>(
  blueprints: readonly TBlueprint[],
  namespace: PolicyCatalogName,
): PolicyCatalogPolicy<TBlueprint>[] => {
  return configurePolicyCatalog(blueprints, { namespace });
};

export const normalizeCatalog = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): TBlueprint =>
  ({ ...blueprint, updatedAt: new Date().toISOString() } as TBlueprint & { updatedAt: string });
