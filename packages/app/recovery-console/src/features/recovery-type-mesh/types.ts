import type { FacetCatalog, FacetToken, RouteFacet } from '@shared/type-level-hub';
import { type NoInfer } from '@shared/type-level';

export type MeshArea = 'fabric' | 'signal' | 'policy' | 'timeline' | 'continuity';
export type MeshMode = 'observe' | 'plan' | 'simulate' | 'operate' | 'review';
export type MeshState = 'idle' | 'running' | 'blocked' | 'complete';

export type MeshTenant = `tenant-${string}`;
export type MeshSessionId = `session-${string}`;
export type MeshRunId = `run-${string}`;

export type MeshRouteCatalog = Record<string, RouteFacet>;
export type MeshTemplate<T extends MeshRouteCatalog> = {
  readonly [K in keyof T & string]: {
    readonly domain: string;
    readonly action: string;
    readonly route: string;
  };
};

export type MeshSignal<T extends string> = T extends `${infer Domain}/${infer Action}/${infer Route}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly route: Route;
    }
  : {
      readonly domain: string;
      readonly action: string;
      readonly route: string;
    };

export type MeshRouteSignal<T extends MeshRouteCatalog> = {
  readonly [K in keyof T & string]: MeshSignal<T[K]>;
};

export type MeshFacetTable<T extends MeshRouteCatalog> = {
  [K in keyof T & string]: FacetToken<K>;
};

export interface MeshMetricRow {
  readonly key: string;
  readonly score: number;
  readonly phase: MeshMode;
  readonly timestamp: string;
}

export interface MeshPlanModel {
  readonly tenant: MeshTenant;
  readonly sessionId: MeshSessionId;
  readonly runId: MeshRunId;
  readonly mode: MeshMode;
  readonly state: MeshState;
  readonly routeSet: readonly string[];
  readonly metrics: readonly MeshMetricRow[];
  readonly signalMap: FacetCatalog<Record<string, RouteFacet>>;
  readonly labels: readonly string[];
}

type Branded<T extends string, B extends string> = T & { readonly __brand: B };
export type MeshStatus = Branded<MeshState, 'MeshStatus'>;

export type MeshPlanState<T extends MeshState = MeshState> = {
  readonly status: Branded<T, 'MeshStatusState'>;
  readonly version: number;
};

export type MeshFilter<T> = T;

export type MeshEnvelope<T extends MeshRouteCatalog> = {
  readonly id: MeshSessionId;
  readonly catalog: T;
  readonly routes: readonly (keyof T & string)[];
  readonly routeSignatures: MeshTemplate<T>;
  readonly routeSignals: MeshRouteSignal<T>;
};

export const meshCatalog = {
  continuity: '/continuity/trace/chain',
  policy: '/policy/simulate/rules',
  signal: '/signal/observe/events',
  fabric: '/fabric/mesh/mesh-graph',
} as const;

export const meshCatalogEntries = Object.entries(meshCatalog) satisfies ReadonlyArray<[string, string]>;

export const createMeshEnvelope = <const T extends MeshRouteCatalog>(
  tenant: string,
  catalog: NoInfer<T>,
): MeshEnvelope<T> => {
  const routes = Object.keys(catalog) as Array<keyof T & string>;
  const routeSignatures = Object.fromEntries(
    Object.entries(catalog).map(([name, value]) => [
      name,
      {
        domain: name,
        action: 'route',
        route: value,
      },
    ]),
  ) as MeshTemplate<T>;

  const routeSignals = Object.fromEntries(
    Object.entries(catalog).map(([name, value]) => [
      name,
      {
        domain: value,
        action: value.split('/')[1] ?? '',
        route: value.split('/')[2] ?? '',
      },
    ]),
  ) as MeshRouteSignal<T>;

  return {
    id: `session-${tenant}` as MeshSessionId,
    catalog,
    routes,
    routeSignatures,
    routeSignals,
  };
};

export type RouteTemplateParts<T extends string> = T extends `/${infer Domain}/${infer Action}/${infer Route}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly route: Route;
    }
  : never;

export type RouteLookupResult<T extends MeshRouteCatalog, K extends keyof T & string = keyof T & string> = T[K] extends string
  ? RouteTemplateParts<T[K]>
  : never;

export type MeshSignalBoard<T extends MeshRouteCatalog> = ReadonlyArray<{
  readonly id: keyof T & string;
  readonly route: T[keyof T & string];
  readonly area: MeshArea;
}>;

export const buildMeshBoard = <const T extends MeshRouteCatalog>(catalog: NoInfer<T>): MeshSignalBoard<T> => {
  const rows = Object.entries(catalog).map(([id, route]) => ({
    id,
    route,
    area: route.includes('/fabric/') ? 'fabric' : route.includes('/signal/') ? 'signal' : route.includes('/policy/') ? 'policy' : route.includes('/timeline/') ? 'timeline' : 'continuity',
  }));
  return rows as unknown as MeshSignalBoard<T>;
};
