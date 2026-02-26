import {
  evaluateFlow,
  parseRoute,
  routeHandlers,
  networkRouteCatalog,
  type BranchContext,
  type BranchEvent,
  type FlowBranch,
  type NetworkRouteParts,
  type NetworkRoutePattern,
} from '@shared/type-level';

export type StressCompilerCommand = {
  readonly route: NetworkRoutePattern;
  readonly branch: FlowBranch;
  readonly context: BranchContext;
};

export type StressCompilerEnvelope = {
  readonly route: NetworkRoutePattern;
  readonly parsed: NetworkRouteParts<NetworkRoutePattern>;
  readonly branchEvent: BranchEvent<FlowBranch>;
  readonly resolved: ReturnType<(typeof routeHandlers)[NetworkRoutePattern]>;
};

export type StressCompilerManifest = {
  readonly runId: `run-${string}`;
  readonly seeds: readonly NetworkRoutePattern[];
  readonly total: number;
  readonly envelopes: readonly StressCompilerEnvelope[];
};

const seedRoutes = networkRouteCatalog.slice(0, 32).map((route) => route as NetworkRoutePattern);

const branchInventory = evaluateFlow('bootstrap', {
  mode: 'strict',
  runId: 'run-bootstrap',
  depth: 4,
});

export const defaultManifest = {
  runId: `run-${branchInventory.timestamp}`,
  seeds: seedRoutes,
  total: seedRoutes.length,
  envelopes: [] as StressCompilerEnvelope[],
} as const satisfies {
  readonly runId: `run-${string}`;
  readonly seeds: readonly NetworkRoutePattern[];
  readonly total: number;
  readonly envelopes: readonly StressCompilerEnvelope[];
};

async function* routeGenerator(routes: readonly NetworkRoutePattern[]): AsyncGenerator<NetworkRoutePattern> {
  for await (const route of routes) {
    yield route;
  }
}

const runScope = async (): Promise<StressCompilerManifest> => {
  await using stack = new AsyncDisposableStack();
  stack.defer(() => Promise.resolve());
  const seeds = seedRoutes;
  const parsed = seeds.map((route: NetworkRoutePattern) => parseRoute(route) as NetworkRouteParts<NetworkRoutePattern>);

  const envelopes = await Promise.all(
    seeds.map(async (route: NetworkRoutePattern, index: number) => {
      const context: BranchContext = {
        mode: index % 2 === 0 ? 'strict' : 'relaxed',
        runId: `run-${route.substring(1, 6)}-${index}` as `run-${string}`,
        depth: (index % 5) + 1,
      };

      const branch: FlowBranch =
        index % 2 === 0
          ? 'dispatch'
          : index % 3 === 0
            ? 'recover'
            : index % 5 === 0
              ? 'reconcile'
            : 'route';

      const routeEvent = evaluateFlow(branch, context);
      const resolved = routeHandlers[route]({ route });

      return {
        route,
        parsed: parsed[index],
        branchEvent: routeEvent,
        resolved,
      } as StressCompilerEnvelope;
    }),
  );

  return {
    runId: `run-${branchInventory.timestamp}`,
    seeds,
    total: seeds.length,
    envelopes,
  } satisfies StressCompilerManifest;
};

export const buildManifest = async (): Promise<StressCompilerManifest> => {
  return runScope();
};

export const executeRoutes = async (commands: readonly StressCompilerCommand[]): Promise<readonly StressCompilerEnvelope[]> => {
  const out: StressCompilerEnvelope[] = [];

  await using session = new AsyncDisposableStack();
  session.defer(() => Promise.resolve());

  for await (const route of routeGenerator(commands.map((item) => item.route))) {
    const command = commands.find((entry) => entry.route === route);
    if (!command) continue;
    const handler = routeHandlers[route];
    const fallback = handler({ route });

    out.push({
      route,
      parsed: parseRoute(route),
      branchEvent: command
        ? evaluateFlow(command.branch, command.context)
        : evaluateFlow('done', {
            mode: 'dry-run',
            runId: `run-${route.substring(1, 8)}` as `run-${string}`,
            depth: route.length,
          }),
      resolved: command
        ? fallback
        : (routeHandlers[route] as (input?: unknown) => ReturnType<(typeof routeHandlers)[NetworkRoutePattern]>)(undefined),
    });
  }

  return out;
};
