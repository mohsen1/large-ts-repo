import { z } from 'zod';
import type { Brand, NoInfer, PathValue, DeepReadonly, UnionToIntersection, DeepMerge } from '@shared/type-level';

type RouteVerb = 'start' | 'plan' | 'simulate' | 'activate' | 'drain' | 'heal' | 'release' | 'archive';
type RouteVerbToken<T extends string> = `verb:${T}`;
type RouteScopeToken<T extends string> = `scope:${T}`;

export type TypeHubVerb = RouteVerb;
export type TypeHubVerbToken<T extends TypeHubVerb> = RouteVerbToken<T>;
export type TypeHubRouteVerb<T extends string> = T extends `${string}/${infer Verb}/${infer Scope}`
  ? `${RouteVerbToken<Verb & TypeHubVerb>}:${RouteScopeToken<Scope>}`
  : `verb:${T}`;

export type HubBrand<T extends string> = Brand<T, 'TypeLevelHubToken'>;

export interface HubRouteCell {
  readonly kind: TypeHubVerb;
  readonly route: string;
  readonly scope: string;
  readonly cost: number;
  readonly tags: readonly string[];
}

export type HubRouteMap<T extends string> = {
  [K in T as K extends `/${infer A}/${infer B}/${infer C}` ? `${A}:${B}:${C}` : K]: HubRouteCell;
};

export type HubCatalogInput = Record<string, string>;

export type HubCatalogByScope<T extends HubCatalogInput> = {
  readonly [K in keyof T]: T[K] extends string
    ? {
        readonly scope: K & string;
        readonly route: T[K];
        readonly key: HubRouteCell['kind'];
      }
    : never;
}[keyof T];

export type HubRouteEnvelope<T extends HubCatalogInput> = {
  readonly version: HubBrand<'v1'>;
  readonly routes: DeepReadonly<HubRouteMap<keyof T & string>>;
  readonly projection: readonly HubCatalogByScope<T>[];
};

export type HubEnvelopeLookup<T extends HubCatalogInput, K extends keyof T & string> =
  K extends keyof T
  ? HubCatalogByScope<Pick<T, K>>
  : never;

export type RouteTemplate<T extends string> = T extends `${infer Domain}/${infer Action}/${infer Resource}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly resource: Resource;
    }
  : never;

export type HubTemplateRoute<T extends string> = RouteTemplate<T>;

export const routeSchema = z.string().regex(/^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);

export const parseHubRoute = <T extends string>(raw: T): HubTemplateRoute<T> | undefined => {
  if (!routeSchema.safeParse(raw).success) return undefined;
  const [domain, action, resource] = raw.replace(/^\//, '').split('/') as [string, string, string];
  return {
    domain,
    action,
    resource,
  } as HubTemplateRoute<T>;
};

export const routeToken = <const T extends string>(value: T): HubBrand<T> =>
  value as HubBrand<T>;

export const createRouteEnvelope = <T extends HubCatalogInput>(
  catalog: NoInfer<T>,
): HubRouteEnvelope<T> => {
  const projection = (Object.entries(catalog) as Array<[Extract<keyof T, string>, string]>).reduce<HubCatalogByScope<T>[]>(
    (acc, [scope, route]) => [
      ...acc,
      {
        scope,
        route,
        key: route.startsWith('/start')
          ? 'start'
          : route.startsWith('/plan')
            ? 'plan'
            : route.startsWith('/simulate')
              ? 'simulate'
              : 'archive',
      } as unknown as HubCatalogByScope<T>,
    ],
    [],
  );

  return {
    version: routeToken('v1'),
    routes: Object.fromEntries(
      (Object.entries(catalog) as Array<[Extract<keyof T, string>, string]>).map(([key, value]) => [
        `${key}:${value}` as string,
        {
          kind: value.includes('/start/')
            ? 'start'
            : value.includes('/plan/')
              ? 'plan'
              : value.includes('/simulate/')
                ? 'simulate'
                : value.includes('/activate/')
                  ? 'activate'
                  : value.includes('/drain/')
                    ? 'drain'
                    : 'archive',
          route: value,
          scope: key,
          cost: value.length,
          tags: [key, value],
        },
      ]) ,
    ) as unknown as DeepReadonly<HubRouteMap<keyof T & string>>,
    projection,
  };
};

const routeValues = <
  T extends HubCatalogInput,
  K extends keyof T & string,
>(
  catalog: NoInfer<T>,
  keys: readonly K[],
) => {
  return keys.map((key) => catalog[key]);
};

export const routeValuesByVerb = <T extends HubCatalogInput>(
  catalog: NoInfer<T>,
  verb: TypeHubVerb,
) => {
  const values = Object.values(catalog) as string[];
  return values.filter((route) => route.includes(`/${verb}/`));
};

export const resolveRouteProjection = <T extends HubCatalogInput, K extends keyof T & string>(
  catalog: NoInfer<T>,
  key: K,
): HubCatalogLookup<T, K> | undefined => {
  const envelope = createRouteEnvelope(catalog);
  const hit = (envelope.projection as readonly HubCatalogByScope<T>[]).find((entry) => entry.scope === key);
  return hit as HubCatalogLookup<T, K> | undefined;
};

export type HubCatalogLookup<T extends HubCatalogInput, K extends keyof T & string> = K extends keyof T
  ? Extract<HubCatalogByScope<T>, { readonly scope: K & string }>
  : never;


export const mergeHubCatalogs = <A extends HubCatalogInput, B extends HubCatalogInput>(
  left: NoInfer<A>,
  right: NoInfer<B>,
): DeepReadonly<DeepMerge<A, B>> => {
  return {
    ...left,
    ...right,
  } as unknown as DeepReadonly<DeepMerge<A, B>>;
};

export const catalogUnion = <Pipes extends readonly HubCatalogInput[]>(...pipes: Pipes) => {
  return pipes.reduce<Record<string, string>>(
    (acc, pipe) => {
      Object.entries(pipe).forEach(([k, v]) => {
        acc[k] = v;
      });
      return acc;
    },
    {},
  ) as UnionToIntersection<Pipes[number]>;
};
