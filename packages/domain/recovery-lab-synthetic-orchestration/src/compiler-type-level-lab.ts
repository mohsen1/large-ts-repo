import { NoInfer } from '@shared/type-level';
import { stressTsStressHarness as harness } from '@shared/type-level';

type RouteCatalog = typeof harness.routeCatalog;
type StressRoute = harness.StressRoute;
type StressRouteEnvelope<T extends StressRoute> = harness.StressRouteEnvelope<T>;
type StressResolverCascade<T extends StressRoute, Depth extends number = 6> = harness.StressResolverCascade<T, Depth>;
type StressResolverChain<T extends readonly StressRoute[]> = {
  [K in keyof T]: harness.DistributeStressResolver<T[K]>;
};
type StressIntersectionMatrix = harness.StressIntersectionMatrix;
type NestedRemap<T extends Record<string, unknown>> = harness.NestedRemap<T>;
type RouteParser<T extends string> = harness.RouteParser<T>;

type ConstraintLoop<
  A extends string,
  B extends string = A,
  C extends Record<string, unknown> = Record<string, unknown>,
  D extends keyof C = keyof C,
  E extends ReadonlyArray<C[D]> = readonly C[D][],
> = {
  a: A;
  b: B;
  c: C;
  keys: D;
  values: E;
};

export type WorkbenchRouteKind = StressRoute;

export type BrandId = `${string}-${string}`;

export interface WorkbenchRecord<T extends WorkbenchRouteKind = WorkbenchRouteKind> {
  readonly id: BrandId;
  readonly route: T;
  readonly resolved: StressRouteEnvelope<T>;
  readonly cascade: StressResolverCascade<T, 4>;
  readonly chain: StressResolverChain<readonly [T]>;
}

export interface WorkbenchManifest<T extends ReadonlyArray<WorkbenchRouteKind> = readonly WorkbenchRouteKind[]> {
  readonly tenant: BrandId;
  readonly routes: readonly WorkbenchRecord<T[number]>[];
  readonly matrix: StressIntersectionMatrix;
  readonly metadata: {
    readonly generatedAt: `${number}-${number}-${number}T${number}:${number}:${number}Z`;
    readonly catalog: RouteCatalog;
  };
}

export type RouteKeySet<T extends readonly WorkbenchRouteKind[]> = {
  [K in keyof T]: T[K] & string;
};

export type RouteBundle<T extends readonly WorkbenchRouteKind[]> = {
  readonly entries: StressResolverChain<T>;
  readonly keys: RouteKeySet<T>;
  readonly constraints: ConstraintLoop<
    'workbench',
    T[number],
    { workbench: StressResolverChain<T> },
    'workbench'
  >;
};

const routeCatalog: RouteCatalog = harness.routeCatalog;
const resolveRoute = harness.resolveRoute as <R extends StressRoute>(
  route: R,
  allowed: readonly R[],
) => StressRouteEnvelope<R>;
const deepMatch = harness.deepMatch as <U>(input: U) => U;

export const synthManifest = <T extends readonly WorkbenchRouteKind[]>(
  tenant: string,
  routes: T,
): WorkbenchManifest<T> => {
  const resolved = routes.map((route) => ({
    id: `${tenant}-${route}` as BrandId,
    route,
    resolved: resolveRoute(route, routes as NoInfer<T>) as StressRouteEnvelope<T[number]>,
    cascade: {} as StressResolverCascade<typeof route>,
    chain: [route] as unknown as StressResolverChain<readonly [typeof route]>,
  }));

  return {
    tenant: `${tenant}-tenant` as BrandId,
    routes: resolved as unknown as WorkbenchManifest<T>['routes'],
    matrix: {} as StressIntersectionMatrix,
    metadata: {
      generatedAt: '2026-02-26T12:00:00Z',
      catalog: routeCatalog,
    },
  };
};

type ParserInput = `${string}/${string}/${string}`;

export interface TemplateMapInput {
  readonly namespace: string;
  readonly route: WorkbenchRouteKind;
}

export const parseTemplate = (input: TemplateMapInput): RouteParser<ParserInput> => ({
  namespace: input.namespace,
  entity: input.route,
  id: input.route,
  raw: `/${input.namespace}/${input.route}` as ParserInput,
});

export type WorkbenchTemplate = `v${number}:${WorkbenchRouteKind}`;
export const toTemplateKey = <T extends WorkbenchRouteKind>(route: T): WorkbenchTemplate => `v1:${route}`;

export const makeNestedMap = <T extends Record<string, unknown>>(input: T): NestedRemap<T> =>
  deepMatch([{}] as never as Record<string, unknown>[]) as unknown as NestedRemap<T>;

export const resolveCatalogConstraints = <T extends readonly WorkbenchRouteKind[]>(
  routes: T,
): RouteBundle<T> => {
  return {
    entries: routes.map((route) => [route] as unknown as StressResolverChain<readonly [typeof route]>) as unknown as StressResolverChain<T>,
    keys: routes as RouteKeySet<T>,
    constraints: {
      a: 'workbench',
      b: routes[0] as T[number],
      c: { workbench: routes.map((route) => [route] as unknown as StressResolverChain<readonly [typeof route]>) as unknown as StressResolverChain<T> },
      keys: 'workbench',
      values: routes as unknown as unknown[] as never,
    } as ConstraintLoop<'workbench', T[number], { workbench: StressResolverChain<T> }>,
  };
};

export type Projection<T extends WorkbenchRouteKind> = {
  readonly route: T;
  readonly resolved: StressRouteEnvelope<T>;
  readonly projection: ConstraintLoop<'root', T, { root: StressRouteEnvelope<T> }>;
};

export const compiledManifest = synthManifest('synthetic', [
  'discover:incident:critical',
  'assess:workload:high',
]) as WorkbenchManifest<readonly ['discover:incident:critical', 'assess:workload:high']>;

export const mapNested = deepMatch([
  { namespace: 'recovery', entity: 'incident', id: 'discover', raw: '/recovery/incident/discover' },
] as const);
