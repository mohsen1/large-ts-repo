export type NoInfer<T> = [T][T extends any ? 0 : never];

export type RegistryRoute =
  | 'registry/activate'
  | 'registry/compose'
  | 'registry/validate'
  | 'registry/dispose'
  | 'registry/snapshot'
  | 'registry/refresh';

export type RegistryContext<TContext, TDomain> = {
  readonly context: TContext;
  readonly domain: TDomain;
  readonly id: string;
};

export type RegistryMutation<T> = {
  readonly op: 'attach' | 'detach' | 'refresh' | 'snapshot';
  readonly payload: T;
};

export type RegistryEnvelope<T, TContext, TDomain> =
  RegistryContext<TContext, TDomain> & RegistryMutation<T> & {
    readonly createdAt: number;
  };

export type RegistryFactoryConfig<TContext, TDomain, TRoute extends RegistryRoute> = {
  readonly route: TRoute;
  readonly context: RegistryContext<TContext, TDomain>;
  readonly mutations: readonly RegistryMutation<TRoute>[];
};

export type RegistryOutput<
  TContext,
  TDomain,
  TRoutes extends readonly RegistryRoute[],
> = TRoutes extends readonly [infer Head extends RegistryRoute, ...infer Rest extends RegistryRoute[]]
  ? readonly [
      RegistryFactoryConfig<TContext, TDomain, Head>,
      ...RegistryOutput<TContext, TDomain, Rest>
    ]
  : [];

export type RegistryDispatchMatrix<TContext, TDomain, TRoutes extends readonly RegistryRoute[]> = {
  readonly domain: TDomain;
  readonly context: TContext;
  readonly configs: RegistryOutput<TContext, TDomain, TRoutes>;
  readonly count: TRoutes['length'];
};

export type RegistryRun<TContext, TDomain, TRoutes extends readonly RegistryRoute[]> = {
  readonly routes: TRoutes;
  readonly envelopes: readonly RegistryEnvelope<
    TRoutes[number],
    TContext,
    TDomain
  >[];
  readonly matrix: RegistryDispatchMatrix<TContext, TDomain, TRoutes>;
  readonly envelopeByRoute: ReadonlyMap<
    string,
    RegistryEnvelope<TRoutes[number], TContext, TDomain>
  >;
};

export type RegistrySolver<TContext, TDomain> = {
  <T extends RegistryRoute>(route: T, mutation: RegistryMutation<T>): RegistryEnvelope<
    T,
    TContext,
    TDomain
  >;
  <T extends RegistryRoute, TContextMap>(route: T, mutation: RegistryMutation<T>, context: TContextMap): RegistryEnvelope<
    T,
    TContextMap,
    TDomain
  >;
};

export const createRegistrySolver = <TContext, TDomain>(base: RegistryContext<TContext, TDomain>): RegistrySolver<TContext, TDomain> => {
  const run = <T extends RegistryRoute>(route: T, mutation: RegistryMutation<T>) => {
    const envelope: RegistryEnvelope<T, TContext, TDomain> = {
      context: base.context,
      domain: base.domain,
      id: `${base.id}:${route}`,
      op: mutation.op,
      payload: mutation.payload as T,
      createdAt: Date.now(),
    };
    return envelope;
  };

  const runWithContext = <T extends RegistryRoute, TContextMap>(
    route: T,
    mutation: RegistryMutation<T>,
    context: TContextMap,
  ) => {
    const envelope: RegistryEnvelope<T, TContextMap, TDomain> = {
      context,
      domain: base.domain,
      id: `${base.id}:${route}`,
      op: mutation.op,
      payload: mutation.payload as T,
      createdAt: Date.now(),
    };
    return envelope;
  };

  return Object.assign(run, { runWithContext }) as RegistrySolver<TContext, TDomain>;
};

export const instantiateRegistry = <
  const TDomain extends string,
  const TContext,
>(
  domain: TDomain,
  context: TContext,
) => {
  const base: RegistryContext<TContext, TDomain> = {
    context,
    domain,
    id: `${domain}-${Date.now().toString(36)}`,
  };

  const solver = createRegistrySolver(base);
  const matrix = <T extends readonly RegistryRoute[]>(routes: T): RegistryDispatchMatrix<TContext, TDomain, T> => {
    return {
      domain,
      context,
      configs: routes.map((route) => ({
        route,
        context: base,
        mutations: [{
          op: 'attach',
          payload: route,
        }],
      })) as RegistryOutput<TContext, TDomain, T>,
      count: routes.length,
    };
  };

  return {
    base,
    solver,
    matrix,
    runCatalog: <T extends readonly RegistryRoute[]>(routes: NoInfer<T>): RegistryRun<TContext, TDomain, T> => {
      const envelopes = routes.map((route) => solver(route, { op: 'attach', payload: route }));
      const matrixValue = matrix(routes);
      const envelopeByRoute = new Map(envelopes.map((entry) => [entry.id, entry])) as ReadonlyMap<
        string,
        RegistryEnvelope<T[number], TContext, TDomain>
      >;
      return {
        routes,
        envelopes,
        matrix: matrixValue,
        envelopeByRoute,
      };
    },
  };
};

export const registryAtlas = {
  runtime: instantiateRegistry('runtime', { profile: 'runtime' }),
  policy: instantiateRegistry('policy', { profile: 'policy' }),
  workflow: instantiateRegistry('workflow', { profile: 'workflow' }),
};

export const buildInstantiationSuite = () => {
  const runtime = registryAtlas.runtime.runCatalog(['registry/activate', 'registry/compose', 'registry/validate']);
  const policy = registryAtlas.policy.runCatalog(['registry/dispose', 'registry/snapshot']);
  const workflow = registryAtlas.workflow.runCatalog(['registry/compose', 'registry/refresh']);

  const bundles = [runtime, policy, workflow];
  const signatures = bundles.flatMap((entry) => entry.routes);
  const matrix = signatures.toSorted();

  return {
    bundles,
    count: matrix.length,
    signatures: matrix,
  };
};

export type SolverCombination = ReturnType<typeof buildInstantiationSuite>;
