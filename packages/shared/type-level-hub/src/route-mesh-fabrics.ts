import type { NoInfer, Brand } from '@shared/type-level';

export type DomainFacet =
  | 'signal'
  | 'drift'
  | 'fidelity'
  | 'continuity'
  | 'incident'
  | 'policy'
  | 'timeline'
  | 'quantum'
  | 'fabric'
  | 'command';

export type ActionFacet =
  | 'bind'
  | 'trace'
  | 'resolve'
  | 'activate'
  | 'validate'
  | 'observe'
  | 'synthesize'
  | 'audit'
  | 'dispatch'
  | 'simulate'
  | 'heal'
  | 'mesh'
  | 'observe-events'
  | 'activate-graph';

export type RouteFacet = `/${DomainFacet}/${ActionFacet}/${string}`;

export type FacetAction<T extends RouteFacet> = T extends `/${infer D}/${infer A}/${infer R}`
  ? D extends DomainFacet
    ? A extends ActionFacet
      ? {
          readonly domain: D;
          readonly action: A;
          readonly resource: R;
        }
      : never
    : never
  : never;

export type FacetToken<T extends string> = Brand<T, 'FacetToken'>;

export type FacetEnvelope<T extends readonly RouteFacet[]> = {
  readonly routes: T;
  readonly index: {
    [K in T[number] as K extends `/${infer D}/${infer _A}/${infer R}` ? `${D}:${R}` : never]: K;
  };
};

export type FacetCatalog<T extends Record<string, RouteFacet>> = {
  [K in keyof T & string]: {
    readonly id: FacetToken<K>;
    readonly route: T[K];
    readonly domain: string;
    readonly action: string;
  };
};

type RouteTemplate<T extends string> = T extends `/${string}/${string}/${string}` ? T : never;

export type RouteUnion<T extends readonly string[]> = T extends readonly [infer H, ...infer R]
  ? H extends string
    ? RouteTemplate<H> | RouteUnion<R & readonly string[]>
    : never
  : never;

export const isRouteFacet = (raw: string): raw is RouteFacet => raw.startsWith('/');

export const facetRoute = <const T extends string>(value: T): FacetToken<T> => value as FacetToken<T>;

export const buildFacetCatalog = <const T extends Record<string, RouteFacet>>(routes: NoInfer<T>): FacetCatalog<T> => {
  const output = {} as Record<string, { [K in keyof T & string]: FacetCatalog<T>[K] }[keyof T & string]>;
  for (const [key, route] of Object.entries(routes) as [keyof T & string, T[keyof T] & string][]) {
    const [, domain, action] = route.split('/') as [string, string, string, string];
    output[key] = {
      id: facetRoute(key),
      route,
      domain: domain as string,
      action: action as string,
    } as (typeof output)[keyof typeof output];
  }
  return output as FacetCatalog<T>;
};

export type RouteSegmentBag<T extends readonly RouteFacet[]> = {
  [K in keyof T]: T[K] extends `/${infer D}/${infer A}/${infer R}`
    ? {
        domain: D;
        action: A;
        resource: R;
      }
    : never;
};

export const segmentBag = <const T extends readonly RouteFacet[]>(routes: T): RouteSegmentBag<T> => {
  return routes.map((route) => {
    const [, domain, action, resource] = route.split('/') as [string, string, string, string];
    return {
      domain,
      action,
      resource,
    };
  }) as RouteSegmentBag<T>;
};

export const routeKeySet = <T extends Record<string, RouteFacet>>(catalog: T): ReadonlySet<keyof T & string> => {
  return new Set(Object.keys(catalog) as Array<keyof T & string>);
};
