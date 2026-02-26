import {
  type GalaxyRoute,
  type GalaxyDispatch,
  type ResolveDispatch,
  galaxyDispatchMatrix,
  resolveGalaxy,
  galaxyCatalog,
  resolveDispatchMatrix,
  DeepRouteChain,
  type RouteMap,
  type RouteCatalog,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
import {
  type FoldedRecursive,
  type FoldRecursive,
  type ResolverPayload,
  type BlueprintRoutes,
  matrix,
  resolveRecursive,
} from '@shared/type-level/stress-recursive-constraint-orchestra';
import type { NoInfer } from '@shared/type-level';

export interface BridgeConfig {
  readonly tenant: string;
  readonly mode: 'live' | 'staged' | 'simulation';
  readonly region: string;
}

export interface InvocationPayload<TKind extends string, TRoute extends GalaxyRoute> {
  readonly kind: TKind;
  readonly route: TRoute;
  readonly config: BridgeConfig;
}

export type BridgeConstraint<T extends BridgeConfig, M extends string> =
  M extends 'live'
    ? (T['tenant'] extends `${string}-prod` ? true : false)
    : M extends 'simulation'
      ? (T['tenant'] extends `${string}-lab` ? true : false)
      : true;

export type HyperInvocation<K extends string, R extends GalaxyRoute, C extends BridgeConfig> = {
  readonly id: `${K}-${R}`;
  readonly kind: K;
  readonly route: R;
  readonly payload: InvocationPayload<K, R>;
  readonly constraint: BridgeConstraint<C, C['mode']>;
};

export type HyperRouteMap<T extends readonly GalaxyRoute[]> = {
  readonly [K in keyof T]: HyperInvocation<ResolveDispatch<T[K] & GalaxyRoute>['normalized'] & string, T[K], BridgeConfig>;
};

export const compileHyperRoutes = <
  const T extends readonly GalaxyRoute[],
  const C extends BridgeConfig,
>(
  routes: T,
  config: C,
  ): { readonly routeMap: HyperRouteMap<T>; readonly checks: string[]; readonly recursive: FoldRecursive<string, 16> } => {
    const flattened = resolveGalaxy(routes);
  const checks = flattened.map((entry: { key: string; normalized: string }) => String(entry.key));
  const recursive = resolveRecursive('recover' as const) as unknown as FoldRecursive<string, 16>;
  const routeMap = flattened.map((entry: { key: string; normalized: string }, index: number) => {
    const route = routes[index % routes.length] as T[number];
    const constraint = (config.mode === 'live'
      ? (config.tenant.endsWith('-prod') as BridgeConstraint<C, C['mode']>)
      : config.mode === 'simulation'
        ? (config.tenant.endsWith('-lab') as BridgeConstraint<C, C['mode']>)
        : (true as BridgeConstraint<C, C['mode']>));
    return {
      id: `${entry.key}-${config.tenant}`,
      kind: String(entry.normalized) as HyperInvocation<string, T[number], C>['kind'],
      route,
      payload: {
        kind: String(entry.normalized),
        route,
        config,
      },
      constraint,
    } as HyperInvocation<HyperInvocation<string, T[number], C>['kind'], T[number], C>;
  }) as HyperRouteMap<T>;

  return {
    routeMap,
    checks,
    recursive,
  };
};

export type ConfigMap = {
  readonly live: BridgeConfig;
  readonly staged: BridgeConfig;
  readonly simulation: BridgeConfig;
};

export const defaultConfigs: ConfigMap = {
  live: {
    tenant: 'tenant-prod',
    mode: 'live',
    region: 'us-east-1',
  },
  staged: {
    tenant: 'tenant-staged',
    mode: 'staged',
    region: 'eu-west-1',
  },
  simulation: {
    tenant: 'tenant-lab',
    mode: 'simulation',
    region: 'ap-south-1',
  },
};

export const runtimeRouteBuckets: readonly BlueprintRoutes[] = Object.keys(matrix) as readonly BlueprintRoutes[];

export const dispatchBlueprint = (mode: keyof ConfigMap): {
  readonly dispatch: GalaxyDispatch;
  readonly payloads: readonly ResolverPayload<typeof matrix[typeof runtimeRouteBuckets[number]]>[];
} => {
  const catalog = matrix[runtimeRouteBuckets[0]!] as keyof typeof matrix;
  const blueprint = matrix[catalog as '/recover/fabric'];
  const constraints = resolveRecursive(blueprint) as unknown as FoldRecursive<number, 12>;

  return {
    dispatch: resolveDispatchMatrix,
    payloads: [constraints, constraints] as never,
  };
};

export type RouteByResolver = {
  readonly catalog: typeof galaxyCatalog;
  readonly routeMatrix: typeof galaxyDispatchMatrix;
};

export const routeByResolver = {
  catalog: galaxyCatalog,
  routeMatrix: galaxyDispatchMatrix,
} as const satisfies RouteByResolver;

export const buildSolverMatrix = () => {
  const live = compileHyperRoutes(galaxyDispatchMatrix, defaultConfigs.live);
  const staged = compileHyperRoutes(galaxyDispatchMatrix, defaultConfigs.staged);
  const simulation = compileHyperRoutes(galaxyDispatchMatrix, defaultConfigs.simulation);

  const checks = [
    ...live.checks,
    ...staged.checks.map((entry) => `staged:${entry}`),
    ...simulation.checks.map((entry) => `sim:${entry}`),
  ];

  const routeMapDigest = live.routeMap
    .concat(staged.routeMap as unknown as typeof live.routeMap)
    .concat(simulation.routeMap as unknown as typeof live.routeMap);

  return {
    checks,
    routeMapDigest,
    recursiveDepth: live.recursive,
  };
};

export type MatrixResult = Awaited<ReturnType<typeof buildSolverMatrix>>;

export const hyperDispatchCatalog = buildSolverMatrix();

export type BrandedKind<T extends string> = T & { readonly __brand: 'HyperBridgeKind' };

export const assertKind = <T extends string>(kind: T): BrandedKind<T> => kind as BrandedKind<T>;

export const noInferBridge = <
  T extends GalaxyRoute,
  C extends BridgeConfig,
>(route: NoInfer<T>, config: NoInfer<C>): {
  readonly route: T;
  readonly config: C;
} => ({ route, config });

export const compiledBridgeSamples = {
  live: noInferBridge(galaxyDispatchMatrix[0] ?? '/discover/incident/critical/id-alpha', defaultConfigs.live),
  staged: noInferBridge(galaxyDispatchMatrix[1] ?? '/assess/incident/high/id-foxtrot', defaultConfigs.staged),
  sim: noInferBridge(galaxyDispatchMatrix[2] ?? '/simulate/fabric/high/id-juliet', defaultConfigs.simulation),
};
