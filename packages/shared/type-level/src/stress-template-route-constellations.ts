export type RouteNamespace = 'alpha' | 'beta' | 'gamma' | 'delta' | 'epsilon';
export type OrbitAction = 'ingest' | 'emit' | 'resolve' | 'sync' | 'bind' | 'release' | 'inspect' | 'report';
export type OrbitSector = 'core' | 'edge' | 'grid' | 'plane' | 'archive';
export type OrbitScope = 'tenant' | 'region' | 'team' | 'global';

export type RouteGrammar = `${RouteNamespace}.${OrbitAction}:${OrbitSector}@${OrbitScope}`;
export type RouteGrammarTuple = RouteGrammar | `${RouteNamespace}.${OrbitAction}:${OrbitSector}@${OrbitScope}#${string}`;

export type ParseRouteLabel<T extends string> = T extends `${infer Namespace}.${infer Action}:${infer Sector}@${infer Scope}`
  ? Namespace extends RouteNamespace
    ? Action extends OrbitAction
      ? Sector extends OrbitSector
        ? Scope extends OrbitScope
          ? {
              readonly namespace: Namespace;
              readonly action: Action;
              readonly sector: Sector;
              readonly scope: Scope;
              readonly flags: ReadonlyArray<T extends `${string}#${infer Flags}` ? Flags : never>;
            }
          : never
        : never
      : never
    : never
  : never;

export type RoutePattern<
  T extends RouteGrammarTuple,
  TScope extends OrbitScope = OrbitScope,
> = T extends `${string}:${infer Sector}@${infer Scope}`
  ? Sector extends OrbitSector
    ? Scope extends TScope
      ? {
          readonly zone: `zone-${Scope}`;
          readonly sector: Sector;
          readonly route: T;
        }
      : never
    : never
  : never;

export type RouteChain = ReadonlyArray<RouteLabel>;

export type RouteLabel = ParseRouteLabel<RouteGrammarTuple>;
export type RouteProjection<T extends RouteGrammarTuple> = {
  [K in T as `resolved:${K}`]: ParseRouteLabel<K> extends {
    readonly namespace: infer Namespace extends string;
    readonly action: infer Action extends string;
  }
    ? `${Namespace}-${Action}`
    : never;
};

export const routeConstellation = [
  'alpha.ingest:grid@tenant',
  'alpha.emit:core@region',
  'alpha.resolve:edge@global',
  'beta.bind:core@team',
  'beta.release:grid@tenant',
  'gamma.inspect:plane@region',
  'gamma.report:archive@global',
  'delta.ingest:core@team',
  'delta.emit:grid@region',
  'epsilon.sync:edge@tenant',
  'epsilon.bind:core@global',
] as const;

export type RouteConstellationMap = RouteChain;
export type RouteConstellationUnion = (typeof routeConstellation)[number];
export type RouteConstellationLookup = {
  readonly [K in RouteConstellationUnion]: RoutePattern<K>;
};

export type TemplateRouteUnion = (typeof routeConstellation)[number];

export type ParsedRouteLabel = ParseRouteLabel<RouteConstellationUnion>;

export const routeLabelIndex = Object.fromEntries(
  routeConstellation.map((route) => {
    const parsed = parseRouteLabel(route);
    return [
      route,
      {
        namespace: parsed.namespace,
        action: parsed.action,
        sector: parsed.sector,
        scope: parsed.scope,
        flags: parsed.flags.join(','),
      } as const,
    ];
  }),
) as Record<RouteConstellationUnion, { namespace: RouteNamespace; action: OrbitAction; sector: OrbitSector; scope: OrbitScope; flags: string }>;

export const parseRouteLabel = <T extends RouteConstellationUnion>(value: T): ParseRouteLabel<T> => {
  const [namespaceAction, scopeTail] = value.split('@');
  const [namespaceRoute, sector] = namespaceAction.split(':');
  const [namespace, action] = namespaceRoute.split('.');
  const route = value as T & RouteGrammarTuple;
  return {
    namespace: namespace as never,
    action: action as never,
    sector: sector as never,
    scope: (scopeTail?.split('#')[0] ?? '') as never,
    flags: scopeTail?.split('#')[1] ? [scopeTail.split('#')[1]] : [],
  } as ParseRouteLabel<T>;
};

export const parseRoutes = (routes: readonly string[]): RouteChain => {
  return routes.map((route) => {
    const parsed = parseRouteLabel(route as RouteConstellationUnion);
    return {
      namespace: parsed.namespace,
      action: parsed.action,
      sector: parsed.sector,
      scope: parsed.scope,
      flags: parsed.flags as readonly string[],
    } as ParseRouteLabel<RouteGrammarTuple>;
  });
};

export const buildRouteLabels = (routes: readonly string[]): Record<string, string> => {
  return routes.reduce(
    (acc, route) => ({
      ...acc,
      [route]: `${route}::label`,
    }),
    {} as Record<string, string>,
  );
};

export const routeConstellationReport = buildRouteLabels(routeConstellation);
