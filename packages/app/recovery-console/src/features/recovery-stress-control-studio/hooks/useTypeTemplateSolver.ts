import { useMemo } from 'react';
import {
  type MappedTemplateProduct,
  type RouteProjection,
  type TemplateSeed,
  type DeepTemplateMap,
} from '@shared/type-level/stress-mapped-template-kits';
import { type DomainToken, type DomainAction } from '@shared/type-level/stress-conditional-lattice';
import { resolveFrom } from '../types/stressTypeLabSchema';
import type { StressTypeLabMode } from '../types/stressTypeLabSchema';

type TemplateEntry = {
  readonly id: string;
  readonly domain: string;
  readonly action: string;
  readonly shape: 'read' | 'write' | 'simulate' | 'audit';
};

type TemplateStore = {
  readonly [k: string]: {
    readonly entries: readonly TemplateEntry[];
    readonly modes: readonly StressTypeLabMode[];
  };
};

const rawCatalog: TemplateEntry[] = [
  { id: 'atlas', domain: 'atlas', action: 'adopt', shape: 'write' },
  { id: 'atlas:route', domain: 'atlas', action: 'route', shape: 'read' },
  { id: 'continuity', domain: 'continuity', action: 'observe', shape: 'audit' },
  { id: 'continuity', domain: 'continuity', action: 'query', shape: 'read' },
  { id: 'chronicle', domain: 'chronicle', action: 'simulate', shape: 'simulate' },
  { id: 'drill', domain: 'drill', action: 'dispatch', shape: 'write' },
  { id: 'fabric', domain: 'fabric', action: 'deploy', shape: 'write' },
  { id: 'forecast', domain: 'forecast', action: 'evaluate', shape: 'read' },
  { id: 'signal', domain: 'signal', action: 'route', shape: 'write' },
  { id: 'timeline', domain: 'timeline', action: 'execute', shape: 'simulate' },
] as const;

const grouped = rawCatalog.reduce<TemplateStore>((acc, entry) => {
  const prev = acc[entry.domain] ?? { entries: [], modes: ['explore', 'simulate', 'validate', 'audit', 'stress', 'graph'] };
  return {
    ...acc,
    [entry.domain]: {
      ...prev,
      entries: [...prev.entries, entry],
      modes: prev.modes,
    },
  };
}, {});

const toActionToken = (domain: string, action: string): DomainAction => `${domain}:${action}` as DomainAction;

const routeTransforms = Object.fromEntries(
  rawCatalog.map((entry, index) => [
    `${entry.domain}:${entry.action}`,
    resolveFrom(entry.domain as DomainToken, toActionToken(entry.domain, entry.action)),
  ]),
);

const toRouteProjection = <T extends string>(value: T): RouteProjection<T> => {
  if (value.includes('atlas')) {
    return { id: 'atlas', domain: 'atlas', tail: 'read', path: value } as RouteProjection<T>;
  }
  if (value.includes('continuity')) {
    return { id: 'continuity', domain: 'continuity', tail: 'write', path: value } as RouteProjection<T>;
  }
  if (value.includes('fabric')) {
    return { id: 'fabric', domain: 'fabric', tail: 'deploy', path: value } as RouteProjection<T>;
  }
  return { path: value } as RouteProjection<T>;
};

export const compileTemplateProducts = <T extends Record<string, TemplateSeed>>(source: T): MappedTemplateProduct<T> => {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [`payload/${key}/v1`, `${value.domain}/${value.action}`]),
  ) as unknown as MappedTemplateProduct<T>;
};

const isDiagnostic = (entry: TemplateEntry): entry is TemplateEntry & { readonly shape: 'audit' | 'simulate' } =>
  entry.shape === 'audit' || entry.shape === 'simulate';

export const useTypeTemplateSolver = (modes: readonly StressTypeLabMode[]) => {
  const modeSet = useMemo(() => new Set(modes), [modes]);
  const deepMap = useMemo(() => {
    const domainMap: Record<string, ReturnType<typeof toRouteProjection>> = {};
    for (const entry of rawCatalog) {
      const route = `${entry.domain}:${entry.action}`;
      domainMap[route] = toRouteProjection(route);
    }
    return domainMap;
  }, []);

  const diagnostics = useMemo(() => rawCatalog.filter(isDiagnostic).map((entry) => entry.id), []);

  const shapeBuckets = useMemo(() => {
    return rawCatalog.reduce<Record<string, string[]>>((acc, entry) => {
      const list = acc[entry.shape] ?? [];
      return {
        ...acc,
        [entry.shape]: [...list, entry.id],
      };
    }, { read: [], write: [], audit: [], simulate: [] });
  }, [modeSet.size]);

  const modeFilters = useMemo(() => {
    const result: Record<StressTypeLabMode, readonly string[]> = {
      explore: rawCatalog.filter((entry) => entry.shape === 'read' || entry.shape === 'simulate').map((entry) => entry.id),
      simulate: rawCatalog.filter((entry) => entry.shape !== 'audit').map((entry) => entry.id),
      validate: rawCatalog.filter((entry) => entry.shape === 'read' || entry.shape === 'write').map((entry) => entry.id),
      audit: rawCatalog.filter((entry) => entry.shape === 'audit').map((entry) => entry.id),
      stress: rawCatalog.map((entry) => entry.id),
      graph: rawCatalog.filter((entry) => entry.shape === 'simulate' || entry.shape === 'audit').map((entry) => entry.id),
    };
    return result;
  }, [modeSet]);

  const applyMode = (mode: StressTypeLabMode) => {
    const candidate = modeFilters[mode];
    const catalog = candidate.map((entryId) => {
      const route = `${entryId}`;
      const projection = toRouteProjection(route);
      const domain = route.includes(':') ? (route.split(':')[0] as string) : route;
      const action = route.includes(':') ? (route.split(':')[1] as string) : 'read';
      const seed: TemplateSeed = {
        id: route,
        domain,
        action,
        enabled: true,
      };
      return {
        id: entryId,
        projection,
        transformed: compileTemplateProducts({ [route]: seed }),
      };
    });
    return {
      mode,
      catalog,
      diagnostics,
      shapeBuckets,
    };
  };

  return {
    grouped,
    routeTransforms,
    deepMap: deepMap as DeepTemplateMap<Record<string, Record<string, string>>>,
    modeSet,
    modeFilters,
    applyMode,
  };
};
