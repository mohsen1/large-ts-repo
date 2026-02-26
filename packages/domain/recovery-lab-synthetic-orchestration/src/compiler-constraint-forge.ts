import {
  atlasRouteCatalog,
  atlasRouteCatalogRoutes,
  type BrandedRoute,
  type RecoveryCommand,
  type RecoveryDomain,
  type RecoveryRoute,
  type RecoveryRouteUnion,
  type ResolveRouteDistributive,
  type RouteConstraintGrid,
  type TemplateEnvelope,
  constraintByDomain,
} from '@shared/type-level/stress-synthetic-atlas';
import {
  buildSolverInput,
  createSolver,
  mapSolverInputByRoute,
  runSolverChain,
  type BranchMatrix,
  type SolverContext,
  type SolverInput,
  type SolverOutput,
} from '@shared/type-level/stress-solver-hub';
import { z } from 'zod';

export interface ConstraintForgeInput {
  readonly tenant: string;
  readonly domain: RecoveryDomain;
  readonly command: RecoveryCommand;
  readonly routes: readonly RecoveryRoute[];
  readonly dryRun: boolean;
}

export interface ConstraintForgeContext {
  readonly tenant: string;
  readonly domain: RecoveryDomain;
  readonly phase: 'capture' | 'enrich' | 'emit';
}

export interface ConstraintForgeTrace {
  readonly key: string;
  readonly command: RecoveryCommand;
  readonly status: 'accepted' | 'rejected' | 'rerouted' | 'errored';
  readonly route: RecoveryRouteUnion;
  readonly payload: string;
}

export type ConstraintForgeDecision<T extends RecoveryRoute> = {
  readonly input: SolverInput<'catalog', RecoveryCommand, RecoveryDomain>;
  readonly route: T;
  readonly output: SolverOutput<RecoveryCommand, T>;
  readonly traces: readonly ConstraintForgeTrace[];
};

export type ConstraintChainEnvelope<
  TRoutes extends readonly RecoveryRoute[],
  TDepth extends number = 6,
> = {
  readonly routes: TRoutes;
  readonly chain: RouteConstraintGrid<TRoutes>;
  readonly depth: TDepth;
  readonly map: TemplateEnvelope<Record<string, Record<string, unknown>>>;
};

export type ConstraintPredicate<T extends RecoveryRoute> = (route: T) => T extends infer _ ? true : false;
export type ConstraintResult<T extends RecoveryRoute> = {
  readonly route: T;
  readonly solved: readonly ResolveRouteDistributive<T>[];
  readonly accepted: boolean;
};

const commandPolicy = z.object({
  tenant: z.string(),
  command: z.string(),
  domain: z.string(),
  dryRun: z.boolean(),
  routes: z.array(z.string()),
});

type SolverPhase = SolverContext<RecoveryCommand>;

const traceRegistry = new Map<string, ConstraintForgeTrace[]>();
const solvedSuffixes = ['ingest', 'transform', 'emit'] as const;
const solvedState = new Map<string, ReturnType<typeof runSolverChain>>();

const solvedKey = (route: RecoveryRoute, context: ConstraintForgeContext): string => `${context.tenant}:${context.domain}:${route}`;

const makeTrace = (
  key: string,
  route: RecoveryRoute,
  command: RecoveryCommand,
  status: ConstraintForgeTrace['status'],
): ConstraintForgeTrace => ({
  key,
  command,
  status,
  route,
  payload: `${key}:${command}:${route}`,
});

const isAllowed = (
  domain: RecoveryDomain,
  command: RecoveryCommand,
  routes: readonly RecoveryRoute[],
): boolean => {
  if (command === 'shutdown' || command === 'freeze') {
    return false;
  }
  if (domain === 'incident' && routes.length > 40) {
    return false;
  }
  return true;
};

const classifyConstraint = (command: RecoveryCommand): 'critical' | 'normal' | 'deferred' => {
  if (command === 'boot' || command === 'recover' || command === 'restore') {
    return 'critical';
  }
  if (command === 'notify' || command === 'observe' || command === 'audit' || command === 'verify') {
    return 'deferred';
  }
  return 'normal';
};

const classifyDomain = (domain: RecoveryDomain): 'system' | 'network' | 'service' => {
  if (domain === 'fabric' || domain === 'mesh' || domain === 'continuity' || domain === 'quantum') {
    return 'network';
  }
  if (domain === 'incident' || domain === 'saga' || domain === 'playbook' || domain === 'chronicle') {
    return 'service';
  }
  return 'system';
};

const classifyRoutes = (routes: readonly RecoveryRoute[]): 'short' | 'long' | 'wide' => {
  if (routes.length < 5) {
    return 'short';
  }
  if (routes.length < 20) {
    return 'wide';
  }
  return 'long';
};

const routeResolver = (routes: readonly RecoveryRoute[], tag: string): readonly BrandedRoute[] =>
  routes.slice(0, 12).map((route) => `${route}:${tag}` as BrandedRoute);

const buildContext = (input: ConstraintForgeInput): ConstraintForgeContext => ({
  tenant: input.tenant,
  domain: input.domain,
  phase: input.dryRun ? 'capture' : 'emit',
});

const normalizeInput = (input: ReturnType<typeof commandPolicy.parse>): ConstraintForgeInput => ({
  tenant: input.tenant,
  domain: input.domain as RecoveryDomain,
  command: input.command as RecoveryCommand,
  routes: input.routes
    .filter((route: string): route is RecoveryRoute => route.includes(':')) as readonly RecoveryRoute[],
  dryRun: input.dryRun,
});

const branchDecision = <T extends RecoveryCommand>(command: T): BranchMatrix<readonly [T]> => ({
  value: [command],
  matrix: {
    alpha: { enabled: true, route: command },
    beta: { enabled: true, route: command.length > 3 },
    gamma: { enabled: true, route: command.length },
    delta: { enabled: true, route: [`${command}`] },
    epsilon: { enabled: true, route: { depth: 0, stage: command } },
    zeta: { enabled: false, route: false },
    eta: { enabled: true, route: true },
    theta: { enabled: true, route: 7 },
    iota: { enabled: false, route: 2 },
    kappa: { enabled: true, route: 'kappa' },
    lambda: { enabled: false, route: 1 },
    mu: { enabled: true, route: command },
    nu: { enabled: true, route: {} },
    xi: { enabled: true, route: [] },
    omicron: { enabled: true, route: command.includes('a') },
    pi: { enabled: true, route: `${command}:pi` },
    rho: { enabled: true, route: command },
    sigma: { enabled: false, route: Symbol.for(command) },
    tau: { enabled: false, route: [] as never },
    upsilon: { enabled: true, route: {} as Record<string, unknown> },
    phi: { enabled: true, route: command },
    chi: { enabled: true, route: command.length },
    psi: { enabled: true, route: `${command}:${command.length}` },
    omega: { enabled: true, route: [command] },
  },
});

const commandSolver = createSolver('solver.ingest', (route: RecoveryRoute) => `${route}:ingested` as RecoveryRoute, 'ingest');
const emitSolver = createSolver('solver.emit', (route: RecoveryRoute) => `${route}:solved` as RecoveryRoute, 'emit');

const runConstraintSolver = (input: ConstraintForgeInput): SolverOutput<RecoveryCommand, RecoveryRoute> => {
  const context = buildContext(input);
  const stage = solvedSuffixes.join(':') as RecoveryCommand;
  const route = input.routes[0] ?? 'boot:incident:low';
  const output = buildSolverInput(route, { depth: input.routes.length, stage: context.domain as RecoveryCommand });
  const cached = solvedKey(route, context);

  if (!solvedState.has(cached)) {
    const chain = runSolverChain(context.tenant, { depth: input.routes.length, stage: context.domain }, ['ingest', 'transform', 'emit']);
    solvedState.set(cached, chain);
  }

  return {
    input: output.command,
    raw: route,
    solved: [output.route as unknown as ResolveRouteDistributive<RecoveryRoute>],
  };
};

const commandPolicyMap = atlasRouteCatalogRoutes.reduce<Record<RecoveryCommand, RecoveryRoute[]>>((acc, route) => {
  const [command] = route.split(':') as [RecoveryCommand];
  (acc[command] ??= []).push(route as RecoveryRoute);
  return acc;
}, {} as Record<RecoveryCommand, RecoveryRoute[]>);

const routeByCommand = (command: RecoveryCommand): RecoveryRoute[] => commandPolicyMap[command] ?? [];

const evaluateCommand = (command: RecoveryCommand): ConstraintForgeTrace['status'] => {
  if (command === 'shutdown' || command === 'freeze') {
    return 'rejected';
  }
  if (command === 'quarantine' || command === 'isolate') {
    return 'rerouted';
  }
  return 'accepted';
};

export const buildConstraintDecision = (
  input: ReturnType<typeof commandPolicy.parse>,
): ConstraintForgeDecision<RecoveryRoute> => {
  const valid = commandPolicy.safeParse(input);
  if (!valid.success) {
    const fallback = 'boot:incident:low' as RecoveryRoute;
    const solverInput = buildSolverInput(fallback, { depth: 0, stage: 'boot' });
    return {
      input: solverInput,
      route: fallback,
      output: {
        input: solverInput.command,
        raw: fallback,
        solved: [solverInput.route as unknown as ResolveRouteDistributive<RecoveryRoute>],
      },
      traces: [makeTrace('invalid', fallback, 'boot', 'errored')],
    };
  }

  const constraintInput = normalizeInput(valid.data);
  const context = buildContext(constraintInput);
  const routes = constraintInput.routes;
  const route = routes[0] ?? 'boot:incident:low';
  const acceptedByPolicy = isAllowed(constraintInput.domain, constraintInput.command, routes);
  const routeDecision = classifyRoutes(routes);
  const classCommand = classifyConstraint(constraintInput.command);
  const classDomain = classifyDomain(constraintInput.domain);
  const _resolvedRoutes = routeResolver(routes, constraintInput.domain);
  const solverOutput = runConstraintSolver(constraintInput);

  const traces: ConstraintForgeTrace[] = [];
  const matrix = branchDecision(constraintInput.command);
  const chain = Object.entries(matrix.matrix);

  for (const [index, routeEntry] of routes.entries()) {
    const status = evaluateCommand(constraintInput.command);
    const trace = makeTrace(`index-${index}`, routeEntry, constraintInput.command, index % 4 === 0 ? 'rerouted' : status);
    traces.push(trace);
    traceRegistry.set(routeEntry, [...(traceRegistry.get(routeEntry) ?? []), trace]);
  }

  if (classCommand === 'deferred' && classDomain === 'system') {
    traces.push(makeTrace('class', route, constraintInput.command, 'accepted'));
  }

  if (routeDecision === 'short' || routeDecision === 'wide') {
    for (const entry of chain) {
      if (entry[1].enabled) {
        traces.push(makeTrace('branch', route, constraintInput.command, acceptedByPolicy ? 'accepted' : 'rejected'));
      }
    }
  }

  if (!acceptedByPolicy) {
    return {
      input: buildSolverInput(route, { depth: routes.length, stage: context.domain as RecoveryCommand }),
      route,
      output: {
        ...solverOutput,
        solved: [...solverOutput.solved],
      },
      traces: [makeTrace('policy', route, constraintInput.command, 'rejected')],
    };
  }

  const commandByDomain = constraintByDomain[constraintInput.domain] ?? [];
  const solved = commandByDomain.map((command) => {
    const [_, __, severity] = route.split(':');
    return {
      command,
      domain: constraintInput.domain,
      severity: severity ?? 'low',
      normalized: command,
    } as ResolveRouteDistributive<RecoveryRoute>;
  });

  return {
    input: buildSolverInput(route, { depth: routes.length, stage: context.domain as RecoveryCommand }),
    route,
    output: {
      ...solverOutput,
      solved: solved as readonly ResolveRouteDistributive<RecoveryRoute>[],
    },
    traces,
  };
};

export const constraintChain = <T extends readonly RecoveryRoute[]>(routes: T): ConstraintChainEnvelope<T> => {
  const decision = buildConstraintDecision({
    tenant: 'synthetic',
    command: (routes[0]?.split(':')[0] ?? 'boot') as RecoveryCommand,
    domain: 'incident',
    routes: [...routes],
    dryRun: true,
  });

  return {
    routes,
    chain: [] as RouteConstraintGrid<T>,
    depth: decision.traces.length as ConstraintChainEnvelope<T>['depth'],
    map: {
      ...({} as TemplateEnvelope<Record<string, Record<string, unknown>>>),
      [decision.route]: {
        raw: decision.route,
        key: decision.route,
      },
    },
  };
};

export const constraintPayloadParser = commandPolicy.parse.bind(commandPolicy);
export const constraintPayloadSafe = commandPolicy.safeParse;
export const runConstraintForge = (input: ConstraintForgeInput): ConstraintForgeDecision<RecoveryRoute> =>
  buildConstraintDecision({
    tenant: input.tenant,
    command: input.command,
    domain: input.domain,
    routes: [...input.routes],
    dryRun: input.dryRun,
  });
