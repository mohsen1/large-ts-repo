import { type IntersectionsAtScale } from '@shared/type-level/stress-intersection-at-scale';
import { type RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';
import type { ConstraintFunctionSet } from '@shared/type-level/stress-instantiation-overload-hub';
import type { StressHubCatalog } from '@shared/stress-lab-runtime';
import { collectStressHubProfiles } from '@shared/stress-lab-runtime';
import {
  type StressBlueprintRegistry,
  buildConstraintEnvelope,
  buildStressBlueprintRegistry,
  createStressHubEnvelope,
  type StressBlueprintProfile,
} from './stress-type-level-hub';

export type StressHubPayload = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly blueprintCount: number;
};

export type StressHubAdapterState = {
  readonly catalog: StressHubCatalog;
  readonly activeDomain: string;
  readonly envelopes: readonly StressHubPayload[];
};

export type StressHubAdapterConfig<T extends string> = {
  readonly tenantId: T;
  readonly namespace: string;
  readonly profile: StressBlueprintProfile;
  readonly routeTuples: readonly RouteTupleLike[];
};

type ConstraintFactory = ConstraintFunctionSet;

export const loadStressHubCatalog = async (tenantId: string): Promise<StressHubCatalog> => {
  return collectStressHubProfiles(tenantId);
};

const constraintFactory: ConstraintFactory = ((value: string, scope?: string, layer?: string) => {
  if (scope === undefined) {
    return `${value}-tag`;
  }
  if (layer === undefined) {
    return `${value}-${scope}` as string;
  }
  return `${value}-${scope}-${layer}`;
}) as ConstraintFunctionSet;

const defaultIntersections: IntersectionsAtScale = [
  {
    kind: 'atlas',
    identity: { id: 'id-1', tenant: 'ops' },
    metrics: { latency: 1 },
  },
  {
    kind: 'atlas',
    identity: { region: 'us-east-1', owner: 'platform' },
    scope: 'disaster',
  },
] as unknown as IntersectionsAtScale;

export const materializeHubCatalog = async (
  tenantId: string,
): Promise<{
  registry: StressBlueprintRegistry;
  catalog: StressHubCatalog;
}> => {
  const registry = buildStressBlueprintRegistry(tenantId);
  const catalog = await loadStressHubCatalog(tenantId);
  return {
    registry: {
      ...registry,
      blueprints: registry.blueprints.map((blueprint) => ({
        ...blueprint,
        constraints: blueprint.constraints,
      })),
    } as StressBlueprintRegistry,
    catalog: {
      ...catalog,
      routes: catalog.routes,
      plugins: [],
    },
  };
};

const createRouteState = <T extends RouteTupleLike>(route: T, constraintProfile: string): {
  readonly route: T;
  readonly state: string;
  readonly resolved: {
    readonly raw: T;
    readonly domain: string;
    readonly action: string;
    readonly scope: string;
    readonly domainProfile: {
      readonly scope: string;
      readonly tier: number;
      readonly criticality: 'low' | 'medium' | 'high' | 'critical';
    };
    readonly actionProfile: {
      readonly stage: string;
      readonly weight: number;
    };
  };
} => {
  return {
    route,
    state: constraintFactory(route, constraintProfile) as string,
    resolved: {
      raw: route,
      domain: `${constraintProfile}:${route}`,
      action: constraintProfile,
      scope: route,
      domainProfile: {
        scope: constraintProfile,
        tier: route.length,
        criticality: 'medium',
      },
      actionProfile: {
        stage: constraintProfile || 'execute',
        weight: route.length,
      },
    },
  };
};

export const seedStressHub = (tenantId: string, namespace: string): readonly StressHubPayload[] => {
  const profiles: StressBlueprintProfile[] = [
    {
      scope: 'analysis',
      severity: 'low',
      domain: 'analytics',
      tags: ['hub', 'bootstrap'],
    },
    {
      scope: 'execution',
      severity: 'high',
      domain: 'recovery',
      tags: ['hub', 'run'],
    },
  ];
  const catalog = buildStressBlueprintRegistry(tenantId);
  const env = createStressHubEnvelope(tenantId, { namespace }, namespace);

  return profiles.map((profile, index) => {
    const lookup = Object.values(catalog.routeLookup);
    const route = (lookup[index % lookup.length] as RouteTupleLike | undefined) ?? 'atlas/bootstrap/seed';
    const constraint = buildConstraintEnvelope(profile.domain, profile.domain, { value: route, severity: profile.severity });
    return {
      tenantId: env.tenantId,
      namespace: `${namespace}-${index}`,
      blueprintCount: catalog.blueprints.length + Object.keys(constraint.catalog).length,
      ...createRouteState(route, constraint.anchor),
    } as StressHubPayload;
  }) as unknown as readonly StressHubPayload[];
};

export const normalizeHubBundle = (value: unknown): string =>
  value === null || value === undefined
    ? 'empty'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
