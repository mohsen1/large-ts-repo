import {
  atlasRouteCatalog,
  atlasRouteCatalogRoutes,
  type BrandedRoute,
  type RecoveryCommand,
  type RecoveryDomain,
  type RecoveryRoute,
  constraintByDomain,
  normalizeRoute,
} from '@shared/type-level/stress-synthetic-atlas';
import { createSolver, runSolverChain, type SolverAdapter, buildSolverInput } from '@shared/type-level/stress-solver-hub';

export interface GenericFactoryOptions<TContext extends string = string> {
  readonly domain: RecoveryDomain;
  readonly tenant: string;
  readonly context: TContext;
  readonly attempts: number;
}

export interface GenericFactoryTrace<T> {
  readonly id: string;
  readonly value: T;
  readonly route: RecoveryRoute;
  readonly accepted: boolean;
}

export type GenericFactoryConstraint<
  TDomain extends RecoveryDomain,
  TCommand extends RecoveryCommand,
  TOutput,
> = {
  readonly domain: TDomain;
  readonly command: TCommand;
  readonly policy: TOutput;
};

export type GenericFactoryPayload<
  TCommands extends RecoveryCommand,
  TInputs extends readonly BrandedRoute[],
  TOutput,
> = {
  readonly commands: readonly TCommands[];
  readonly inputs: TInputs;
  readonly output: TOutput;
};

export type FactoryDispatch<
  TRoutes extends readonly RecoveryRoute[],
  TDomain extends RecoveryDomain,
> = {
  readonly domain: TDomain;
  readonly factories: {
    readonly route: TRoutes[number];
    readonly policy: readonly RecoveryCommand[];
    readonly run: (route: TRoutes[number]) => RecoveryCommand;
    readonly trace: readonly GenericFactoryTrace<RecoveryRoute>[];
  }[];
  readonly dispatch: (seed: string) => DispatchResult<TRoutes>[];
};

type DispatchResult<T extends readonly RecoveryRoute[]> = {
  readonly route: T[number];
  readonly output: ReturnType<typeof runSolverChain>;
  readonly policy: RecoveryCommand;
  readonly trace: {
    readonly input: ReturnType<typeof buildSolverInput>;
    readonly raw: T[number];
  };
};

const routePolicy = (domain: RecoveryDomain): ReadonlyArray<RecoveryCommand> =>
  Array.from(new Set(constraintByDomain[domain] ?? []));

const resolveCommand = (route: RecoveryRoute, domain: RecoveryDomain): RecoveryCommand => {
  const [command] = route.split(':') as [RecoveryCommand];
  if (domain === 'policy' || command === 'observe') {
    return 'assess';
  }
  return command;
};

export function buildPolicyMap<TDomain extends RecoveryDomain>(domain: TDomain) {
  const rawRoutes = atlasRouteCatalog[domain as keyof typeof atlasRouteCatalog] as unknown as string[] | undefined;
  const routeCatalog = rawRoutes ? rawRoutes.flatMap((command) =>
    atlasRouteCatalogRoutes.filter((route) => route.startsWith(`${command}:${domain}:`)),
  ) : atlasRouteCatalogRoutes;

  return {
    domain,
    commandBuckets: routePolicy(domain),
    routes: routeCatalog as readonly RecoveryRoute[],
    resolve: routePolicy,
  };
}

export const instantiatePolicyFactory = <
  TPolicy,
  const TRoutes extends readonly RecoveryRoute[],
  const TDomain extends RecoveryDomain,
>(
  domain: TDomain,
  routes: TRoutes,
  build: (route: RecoveryRoute) => TPolicy,
): {
  readonly domain: TDomain;
  readonly policies: {
    [K in keyof TRoutes]: GenericFactoryPayload<RecoveryCommand, readonly [BrandedRoute], TPolicy>;
  };
} => ({
  domain,
  policies: routes.map((route) => {
    const command = route.split(':')[0] as RecoveryCommand;
    return {
      commands: [command],
      inputs: [normalizeRoute(route)],
      output: build(route),
    } as GenericFactoryPayload<RecoveryCommand, readonly [BrandedRoute], TPolicy>;
  }) as {
    [K in keyof TRoutes]: GenericFactoryPayload<RecoveryCommand, readonly [BrandedRoute], TPolicy>;
  },
});

const solverA = createSolver<RecoveryRoute, RecoveryRoute>(
  'factory.ingest',
  (value) => value.toLowerCase() as RecoveryRoute,
  'ingest',
);
const solverB = createSolver(
  'factory.route',
  (value) => `${value}:policy` as unknown as RecoveryRoute,
  'transform',
);

export const buildGenericFactory = <TInput, TOutput>(
  name: string,
  resolver: (input: TInput) => TOutput,
): {
  readonly name: string;
  readonly run: (input: TInput) => TOutput;
} => ({
  name,
  run(input) {
    return resolver(input);
  },
});

export const buildMultiFactory = <
  TRoutes extends readonly RecoveryRoute[],
  const TDomain extends RecoveryDomain,
>(
  domain: TDomain,
  routes: TRoutes,
): FactoryDispatch<TRoutes, TDomain> => {
  const policies = routePolicy(domain);
  const traces: GenericFactoryTrace<RecoveryRoute>[] = [];
  const factories = routes.map((route, index) => {
    const command = resolveCommand(route, domain);
    const trace: GenericFactoryTrace<RecoveryRoute> = {
      id: `${String(domain)}-${index}`,
      value: route,
      route,
      accepted: command.length % 2 === 0,
    };
    traces.push(trace);
    return {
      route,
      policy: policies,
      trace: traces.slice(),
      run() {
        return command;
      },
    };
  });

  return {
    domain,
    factories,
    dispatch(seed: string) {
      const output = runSolverChain(seed, { depth: 1, stage: seed }, ['ingest', 'transform', 'emit']);
      return routes.map((route) => ({
        route,
        output,
        policy: resolveCommand(route, domain),
        trace: {
          input: buildSolverInput(route, { depth: output.value.length, stage: 'boot' }),
          raw: route,
        },
      }));
    },
  };
};

const factoryCatalog = [
  atlasRouteCatalogRoutes.slice(0, 30).map((route) => normalizeRoute(route as RecoveryRoute)),
  atlasRouteCatalogRoutes.slice(30, 60).map((route) => normalizeRoute(route as RecoveryRoute)),
].flatMap((entry) => entry);

export const buildFactoryRegistry = () => {
  const domains = ['incident', 'workload', 'fabric', 'policy', 'chronicle', 'cockpit'] as const;
  const registry = domains.map((domain) =>
    instantiatePolicyFactory(
      domain,
      atlasRouteCatalogRoutes
        .filter((route) => route.includes(`:${domain}:`))
        .slice(0, 12) as readonly RecoveryRoute[],
      (route) => ({ route }) as { route: RecoveryRoute },
    ),
  );
  const resolved = registry.map((entry) => ({ domain: entry.domain, count: entry.policies.length }));

  return {
    registry,
    resolved,
    total: resolved.reduce((sum, item) => sum + item.count, 0),
  };
};

type BrandedOutput = {
  readonly brand: 'factory';
  readonly token: BrandedRoute;
};

export const runGenericFactoryMatrix = (
  options: GenericFactoryOptions<'policy'>,
): readonly {
  readonly domain: RecoveryDomain;
  readonly route: RecoveryRoute;
  readonly payload: BrandedOutput;
}[] => {
  const routeBuckets = atlasRouteCatalogRoutes
    .filter((route) => route.includes(`:${options.domain}:`))
    .slice(0, 20) as RecoveryRoute[];
  const policies = buildFactoryRegistry();
  const out: Array<{ domain: RecoveryDomain; route: RecoveryRoute; payload: BrandedOutput }> = [];

  const adapters: SolverAdapter<RecoveryRoute, unknown>[] = [solverA, solverB];
  for (const adapter of adapters) {
    void adapter;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const route of routeBuckets) {
      if (options.context === 'policy' && attempt % 2 === 0) {
        out.push({
          domain: options.domain,
          route,
          payload: {
            brand: 'factory',
            token: normalizeRoute(route),
          },
        });
      }
    }
    if (policies.total < 1) {
      break;
    }
  }

  return out;
};

export const solverAdapters: readonly SolverAdapter<RecoveryRoute, RecoveryRoute>[] = [solverA, solverB];
export const factoryRouteMap = factoryCatalog;
