import { computeFlowDecision, type FlowEnvelope, type FlowTrace, runControlFlowVolcano } from '@shared/type-level/stress-control-flow-volcano';
import { buildInvocationMatrix, createConflictSolver, runSolverConflictSuite } from '@shared/type-level/stress-constraint-conflict-forge';
import { namedProfiles, type SolverInput } from '@shared/type-level/stress-runtime';
import { makeCatalogGrid, type CatalogBuilderState } from '@shared/type-level/stress-recursive-tuple-forge';
import {
  normalizeStormRoute,
  routeSignalCatalog,
  type RouteProjection,
  type StormRoute,
} from '@shared/type-level/stress-conditional-union-storm';

export type DomainMode =
  | 'bootstrap'
  | 'ingest'
  | 'score'
  | 'resolve'
  | 'review'
  | 'publish'
  | 'close';

export interface HubCommand {
  readonly command: string;
  readonly mode: DomainMode;
  readonly priority: 0 | 1 | 2 | 3 | 4;
}

export type DomainRoute = StormRoute;
export type RouteProjectionCatalog = Record<DomainRoute, RouteProjection<DomainRoute>>;

export interface RouteTuple<T extends readonly DomainRoute[]> {
  readonly route: T[number];
  readonly index: number;
  readonly projection: RouteProjection<DomainRoute>;
}

export interface HubSolverInput {
  readonly tenant: string;
  readonly namespace: string;
}

const commandQueue: readonly HubCommand[] = [
  { command: 'bootstrap', mode: 'bootstrap', priority: 4 },
  { command: 'ingest', mode: 'ingest', priority: 3 },
  { command: 'resolve', mode: 'resolve', priority: 2 },
  { command: 'publish', mode: 'publish', priority: 1 },
] as const;

export const resolveRouteProjection = (route: DomainRoute): RouteProjection<DomainRoute> => {
  const [entity, action, severity, id, ..._rest] = route.split('/').slice(1);
  const canonical = normalizeStormRoute(route);
  return {
    route,
    entity,
    action,
    severity: severity ?? canonical.severity,
    id: id ?? canonical.id,
    mode: (_rest[0] ?? 'default') as string,
    domain: entity,
    signature: canonical.routeSignal,
    verb: canonical.verb,
    routeSignal: canonical.routeSignal,
  } as unknown as RouteProjection<DomainRoute>;
};

export const routeProjectionCatalog = (routes: readonly DomainRoute[]): RouteProjectionCatalog => {
  const catalog: Partial<RouteProjectionCatalog> = {};

  for (const route of routes) {
    catalog[route] = resolveRouteProjection(route);
  }

  return catalog as RouteProjectionCatalog;
};

const hubSolverInput: HubSolverInput = {
  tenant: 'incident-tenant',
  namespace: 'incident-ns',
};

export const hubRuntimePlan = (routes: readonly DomainRoute[]) => {
  const projection = routeProjectionCatalog(routes);
  const flow = runControlFlowVolcano(
    routes.map(
      (route, index): FlowEnvelope => ({
        mode: index % 2 === 0 ? 'discover' : 'repair',
        tenant: `tenant-${route.replace('/', '')}`,
        severity: index % 2 === 0 ? 'high' : 'critical',
        routeId: route,
        count: index + 1,
      }),
    ),
  );

  return {
    projection,
    decisions: flow,
    tupleCount: commandsToTuple(routes).length,
    manifest: routeSignalCatalog,
    profile: namedProfiles,
  };
};

export const toRouteTuple = <T extends readonly DomainRoute[]>(routes: T): RouteTuple<T>[] =>
  routes.map((route, index) => ({
    route,
    index,
    projection: normalizeStormRoute(route),
  })) as RouteTuple<T>[];

const commandsToTuple = (routes: readonly DomainRoute[]) =>
  routes.map((route, index) => ({ route, command: commandQueue[index % commandQueue.length] ?? commandQueue[0]! }));

export const buildFlowEnvelope = (routes: readonly DomainRoute[], mode: FlowEnvelope['mode']): FlowEnvelope[] =>
  routes.map((route, index) => ({
    mode,
    tenant: route,
    severity: index % 2 === 0 ? 'high' : 'low',
    routeId: route,
    count: index + 1,
  }));

export const invokeFromDecision = (trace: FlowTrace, fallback: SolverInput<string>['stage']) => {
  const next = toRouteTuple(routeSignalCatalog.map((item) => item.route as DomainRoute));
  return {
    decision: trace.decision,
    envelope: trace.envelope,
    fallback,
    seed: next,
  };
};

type ConflictResult = ReturnType<typeof runSolverConflictSuite>;

type SolverCatalog = {
  readonly solver: ReturnType<typeof createConflictSolver>;
  readonly payload: {
    readonly route: DomainRoute;
    readonly projection: RouteProjection<DomainRoute>;
  };
};

const solver = createConflictSolver<'incident', { readonly route: string }, 'high'>('incident', 'high');

export const compileHubConstraints = (): ConflictResult[] => {
  const routes = routeSignalCatalog.map((item, index) => ({
    route: item.route,
    projection: item,
    routeIndex: index,
    priority: (index % 5) as 0 | 1 | 2 | 3 | 4,
  }));

  const calls: SolverCatalog[] = routes.map((entry) => ({
    solver,
    payload: {
      route: entry.route,
      projection: resolveRouteProjection(entry.route),
    },
  }));

  return calls.map((entry, index) =>
    runSolverConflictSuite(
      entry.solver,
      index % 2 === 0 ? 'discover' : 'repair',
      { route: entry.payload.route } as { route: string },
      'incident',
      'high',
    ),
  );
};

export const compiledHubConstraints = compileHubConstraints();

export const invokeHubFlow = (flow: readonly FlowTrace[]) =>
  flow
    .filter((trace) => trace.decision.accepted)
    .map((trace) => {
      const route = (trace.envelope.routeId as DomainRoute) ?? ('/incident/discover/high/R-01' as const);
      const next = toRouteTuple([route])[0]!;
      const mode = trace.envelope.severity === 'critical' ? 'bootstrap' : 'ingest';
      const decision = computeFlowDecision({
        mode: mode === 'bootstrap' ? 'discover' : 'notify',
        tenant: trace.envelope.tenant,
        severity: trace.envelope.severity,
        routeId: trace.envelope.routeId,
        count: trace.envelope.count,
      });
      return {
        route,
        next,
        branch: trace.decision.branch,
        mode,
        final: decision,
      };
    });

export const defaultSolverCatalog = (): CatalogBuilderState => makeCatalogGrid('incident') as CatalogBuilderState;

export const routeTemplates = buildInvocationMatrix(
  [
    {
      input: { input: '/incident/discover/high/R-100' },
      tag: 'discover',
      seed: hubSolverInput,
      issuedAt: 0,
    },
    {
      input: { input: '/workload/repair/medium/R-101' },
      tag: 'repair',
      seed: { tenant: 'workload' },
      issuedAt: 1,
    },
  ] as const,
  ['strict', 'strict', 'adaptive', 'diagnostic'],
);

export const dispatchFlow = (routes: readonly DomainRoute[]) => {
  const plan = hubRuntimePlan(routes);
  const constraints = compileHubConstraints();
  const mapped = commandsToTuple(routes);

  return {
    plan,
    constraints,
    routeTuples: mapped,
    flowProfiles: buildInvocationMatrix(
      mapped.map((entry, index) => ({
        input: { route: entry.route, mode: entry.command.mode },
        seed: entry.command,
        tag: entry.command.command,
        issuedAt: index + 1,
      })),
      ['strict', 'adaptive', 'maintenance'],
    ),
  };
};

export const hubDispatch = dispatchFlow([
  '/incident/discover/high/R-100',
  '/workload/repair/medium/R-101',
  '/command/assess/low/R-102',
  '/risk/recover/high/R-103',
] as const);
