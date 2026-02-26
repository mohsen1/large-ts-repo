import { useCallback, useMemo, useState } from 'react';
import {
  atlasCatalogLookup,
  atlasRouteCatalog,
  atlasRoutes,
  routeValueProjection,
  resolveAtlasRoute,
  type AtlasCatalogLookup,
  type AtlasRoute,
  type AtlasRouteUnion,
  hydrateAtlasChain,
} from '@shared/type-level';

export type StressAtlasRoute = AtlasRouteUnion;

export type StressAtlasPayload = {
  readonly route: StressAtlasRoute;
  readonly token: string;
  readonly severity: 'high' | 'medium' | 'low';
};

export interface StressAtlasQueryState {
  readonly selected: ReadonlySet<StressAtlasRoute>;
  readonly loaded: number;
  readonly lookup: Record<string, AtlasCatalogLookup<AtlasRouteUnion>>;
  readonly catalog: Map<AtlasRouteUnion, AtlasCatalogLookup<AtlasRouteUnion>>;
  readonly traces: string[];
}

export type StressAtlasDecision =
  | {
      readonly kind: 'trace';
      readonly route: StressAtlasRoute;
      readonly trace: string;
    }
  | {
      readonly kind: 'resolve';
      readonly route: StressAtlasRoute;
      readonly projection: ReturnType<typeof routeValueProjection<AtlasRouteUnion>>;
    }
  | {
      readonly kind: 'error';
      readonly route: StressAtlasRoute;
      readonly message: string;
    };

const emptyChain = hydrateAtlasChain([...atlasRoutes]);

const traceTag = Symbol('stressAtlasTrace');

const toSeverity = (route: StressAtlasRoute): 'high' | 'medium' | 'low' => {
  if (route.includes('/critical/') || route.includes('/escalate/')) return 'high';
  if (route.includes('/recover/') || route.includes('/mitigate/')) return 'medium';
  return 'low';
};

const toPayload = (route: StressAtlasRoute): StressAtlasPayload => {
  const parsed = resolveAtlasRoute(route);
  return {
    route,
    token: parsed.payload.route,
    severity: toSeverity(route),
  };
};

const buildDecisionLog = (route: StressAtlasRoute): readonly StressAtlasDecision[] => {
  const decisions = [] as StressAtlasDecision[];
  const projection = routeValueProjection(route);
  decisions.push({
    kind: 'resolve',
    route,
    projection,
  });
  if (route.includes('recover')) {
    decisions.push({
      kind: 'trace',
      route,
      trace: `[${String(traceTag)}] recover-mode`,
    });
  }
  if (route.includes('synthesize')) {
    decisions.push({
      kind: 'trace',
      route,
      trace: `[${String(traceTag)}] synthesis-mode`,
    });
  }
  if (route.includes('critical')) {
    decisions.push({
      kind: 'error',
      route,
      message: 'critical classification',
    });
  }
  return decisions;
};

export interface UseTypeStressAtlasOptions {
  readonly preselected?: readonly StressAtlasRoute[];
  readonly includeAll?: boolean;
}

export const useTypeStressAtlas = (options: UseTypeStressAtlasOptions = {}) => {
  const { preselected = [], includeAll = false } = options;
  const [selection, setSelection] = useState<ReadonlySet<StressAtlasRoute>>(
    () => new Set(preselected ?? []),
  );

  const payloads = useMemo(() => {
    const source: readonly StressAtlasRoute[] = includeAll ? atlasRouteCatalog : [...selection] as StressAtlasRoute[];
    return source.map((route) => toPayload(route));
  }, [selection, includeAll]);

  const [query, setQuery] = useState('');

  const lookup = useMemo(() => {
    const entries = new Map<string, string>(
      payloads.map((payload) => [payload.route, payload.route]),
    );
    return entries;
  }, [payloads]);

  const filtered = useMemo(() => payloads.filter(({ route }) => route.includes(query)), [payloads, query]);

  const traces = useMemo(
    () =>
      filtered.flatMap(({ route }) => {
        return buildDecisionLog(route);
      }),
    [filtered],
  );

  const toggle = useCallback((route: StressAtlasRoute) => {
    setSelection((state) => {
      const next = new Set(state);
      if (next.has(route)) {
        next.delete(route);
      } else {
        next.add(route);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelection(new Set());
  }, []);

  const hydrate = useCallback(() => {
    const values = hydrateAtlasChain([...atlasRoutes]);
    setSelection(new Set(Object.keys(values) as StressAtlasRoute[]));
  }, []);

  const lookupByType = useMemo(() => {
    const catalog: Partial<Record<StressAtlasRoute, AtlasCatalogLookup<AtlasRouteUnion>>> = {};
    const routes = includeAll ? atlasRouteCatalog : [...selection];
    for (const route of routes) {
      catalog[route] = resolveAtlasRoute(route).discriminant as unknown as AtlasCatalogLookup<AtlasRouteUnion>;
    }
    return catalog as Readonly<Record<StressAtlasRoute, AtlasCatalogLookup<AtlasRouteUnion>>>;
  }, [selection, includeAll]);

  return {
    query,
    setQuery,
    selection,
    payloads,
    filtered,
    lookup,
    traces,
    toggle,
    clear,
    hydrate,
    lookupByType,
    emptyChain,
    routeCatalog: atlasCatalogLookup,
    routeTemplateCount: atlasRoutes.length,
  } as const;
};

export const useTypeStressAtlasDiagnostics = (route: StressAtlasRoute) => {
  return getAtlasRouteDiagnostics(route);
};

export const getAtlasRouteDiagnostics = (route: StressAtlasRoute) => {
  return {
    route,
    projection: routeValueProjection(route),
    decision: buildDecisionLog(route),
    severity: toSeverity(route),
  };
};
