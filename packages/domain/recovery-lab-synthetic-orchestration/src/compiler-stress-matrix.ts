import { randomUUID } from 'node:crypto';
import {
  parseHyperRoute,
  type HyperRoute,
  type RouteCascade,
  type RouteEnvelope,
  type RouteSet,
  resolveRouteGrid,
  buildRouteCascade,
} from '@shared/type-level/stress-hyper-union';
import { evaluateFlow, evaluateNestedFlow, type FlowInput, type FlowOutcome } from '@shared/type-level/stress-flow-labyrinth';
import { buildClassChain } from '@shared/type-level/stress-hierarchy-lattice-cascade';
import {
  buildSolverFactory,
  solveWithFactory,
  type SolverAdapter,
  type SolverPayload,
  type SolverOutput,
} from '@shared/type-level/stress-generic-instantiation-forge';
import { mergeIntersectionChain, buildStormEnvelope, stormCatalog, type StormIntersection } from '@shared/type-level/stress-intersection-storm';
import { mapTemplateWithTemplateLiteral, nestedRemap, rawRouteTemplateSource } from '@shared/type-level/stress-template-route-fabric';

type StressSeed = readonly HyperRoute[];
type StressMode = 'preview' | 'probe' | 'recover' | 'audit';

type StressTrace = ReadonlyArray<{
  readonly route: HyperRoute;
  readonly action: string;
  readonly severity: RouteEnvelope<HyperRoute>['parsed']['severity'];
}>;

export const stressSeedRoutes = [
  'incident:discover:low:id-a',
  'incident:assess:critical:id-f',
  'incident:restore:critical:id-h',
  'workload:mitigate:emergency:id-g',
  'fabric:triage:critical:id-e',
  'policy:notify:high:id-h',
  'mesh:seal:critical:id-d',
  'telemetry:observe:critical:id-j',
  'signal:triage:extreme:id-g',
  'continuity:stabilize:extreme:id-g',
  'compliance:archive:extreme:id-e',
] as const satisfies StressSeed;

type SolverResultTuple<TMode extends StressMode> = {
  readonly bundle: readonly unknown[];
  readonly tags: readonly unknown[];
  readonly recursive: {
    readonly terminal: false;
    readonly value: { route: HyperRoute; mode: TMode };
    readonly depth: number;
    readonly history: readonly unknown[];
    readonly next: null;
  };
  readonly branch: `seed:${number}`;
};

type StressEnvelope<T extends StressSeed, TMode extends StressMode = 'preview'> = Readonly<{
  readonly id: string;
  readonly seed: T;
  readonly mode: TMode;
  readonly cascades: readonly RouteCascade<HyperRoute, 12>[];
  readonly routeSet: RouteSet<T>;
  readonly trace: StressTrace;
  readonly storm: {
    readonly matrix: StormIntersection;
    readonly catalog: typeof stormCatalog;
  };
  readonly templateRows: readonly string[];
  readonly templates: readonly string[];
  readonly hierarchy: {
    readonly stage: number;
    readonly verified: true;
    readonly marker: string;
  };
  readonly templateRowsCount: number;
  readonly score: number;
}>;

export const makeSolverRecord = <TMode extends StressMode>(
  seed: StressSeed,
  mode: TMode,
): SolverResultTuple<TMode> => {
  const adapter: SolverAdapter<TMode, { readonly accepted: boolean; readonly route: string }> = buildSolverFactory(
    `suite-${seed[0] ?? 'seed'}`,
    mode,
    { namespace: 'matrix', markers: [mode, seed[0] ?? 'seed'] },
  );
  const payload: SolverPayload<TMode> = {
    mode,
    score: seed.length,
    route: seed[0] ?? 'incident:discover:low:id-a',
    markers: seed.slice(0, 3),
  };
  const output: SolverOutput<TMode, { readonly accepted: boolean; readonly route: string }> = solveWithFactory(adapter, mode, {
    route: `/suite/${seed[0] ?? 'seed'}`,
    markers: payload.markers,
  });
  return {
    bundle: [],
    tags: seed as never,
    recursive: {
      terminal: false,
      value: { route: (seed[0] ?? 'incident:discover:low:id-a') as HyperRoute, mode },
      depth: 3,
      history: [output as never],
      next: null,
    },
    branch: `seed:${seed.length}`,
  };
};

const severityRank: Record<RouteEnvelope<HyperRoute>['parsed']['severity'], number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
  emergency: 8,
  extreme: 13,
};

const resolveEnvelope = (seed: StressSeed): StressTrace =>
  seed.map((route) => {
    const parsed = parseHyperRoute(route);
    return {
      route,
      action: parsed.parsed.label,
      severity: parsed.parsed.severity,
    };
  });

const normalizeFlowSeverity = (severity: RouteEnvelope<HyperRoute>['parsed']['severity']): FlowInput['severity'] =>
  severity === 'none' ? 'low' : severity === 'extreme' ? 'critical' : severity;

const toTemplateFromRoute = <T extends HyperRoute>(route: T): RouteEnvelope<T>['parsed']['template'] => {
  const parsed = parseHyperRoute(route);
  return parsed.parsed.template;
};

const buildFlowInputs = (routes: StressSeed): FlowInput[] =>
  routes.map((route, index) => {
    const parsed = parseHyperRoute(route);
    const severity = normalizeFlowSeverity(parsed.parsed.severity);
    return {
      kind: ((index % 50) + 1) as FlowInput['kind'],
      route,
      attempt: index + severityRank[parsed.parsed.severity],
      severity,
    };
  });

const buildStormRecord = (routes: StressSeed) => {
  const intersections = mergeIntersectionChain(
    routes.map((route) => ({
      alpha: route.length,
      beta: route,
      gamma: route.length % 2 === 0,
      delta: [route],
      epsilon: { id: route, weight: route.length },
      zeta: { [route]: route.length },
      eta: [{ state: route, rank: route.length }],
      theta: new Map([[route, route]]),
      iota: Symbol(route),
      kappa: BigInt(route.length),
      lambda: { value: route.length, unit: 'ms' },
      mu: [[route, route.length]],
      nu: new Set([route]),
      xi: { key: 'route', value: route },
      omicron: { domain: route.split(':')[0], verb: route.split(':')[1], severity: route.split(':')[2] },
      pi: route.length,
      profile: { profileId: `${route.length}`, version: route.length },
      rho: { route, score: route.length },
      sigma: [route],
      tau: Promise.resolve(route),
    }) as StormIntersection),
  );
  return buildStormEnvelope(intersections);
};

const templateRowsFromMap = (mapObj: typeof rawRouteTemplateSource): string[] => {
  const result: string[] = [];
  for (const [domain, verbs] of Object.entries(mapObj) as Array<[string, Record<string, unknown>]>) {
    for (const verb of Object.keys(verbs)) {
      result.push(`/${domain}/${verb}`);
      result.push(`mapped.${domain}:${verb}`);
    }
  }
  return result;
};

const buildHierarchy = (routes: StressSeed) => {
  const chain = buildClassChain(routes[0] ?? 'seed');
  return {
    stage: chain.stage,
    verified: true as const,
    marker: chain.marker,
  };
};

export const buildStressEnvelope = <TMode extends StressMode>(
  routes: StressSeed = stressSeedRoutes,
  mode: TMode = 'preview' as TMode,
): StressEnvelope<typeof routes, TMode> => {
  const normalized = routes;
  const parsed = resolveRouteGrid(routes);
  const cascades = buildRouteCascade(routes, 12);
  const templateFromRoutes = normalized.map((route) => toTemplateFromRoute(route));
  const templates = mapTemplateWithTemplateLiteral(rawRouteTemplateSource);
  const mapped = nestedRemap(rawRouteTemplateSource);
  const templateRows = templateRowsFromMap(rawRouteTemplateSource);
  const storm = buildStormRecord(routes);
  const trace = resolveEnvelope(routes);
  const flow = buildFlowInputs(routes).map((entry) => evaluateNestedFlow(entry));
  const hierarchy = buildHierarchy(routes);
  const score = routes.reduce((acc, route) => {
    const parsedRoute = parseHyperRoute(route);
    return acc + severityRank[parsedRoute.parsed.severity];
  }, 0);

  makeSolverRecord(routes, mode);

  const flowTrace = flow.map<StressTrace[number]>((entry) => ({
    route: (entry.route as HyperRoute) ?? 'incident:discover:low:id-a',
    action: entry.reason,
    severity: entry.status === 'abort' ? 'critical' : entry.status === 'warning' ? 'low' : 'medium',
  }));

  return {
    id: randomUUID(),
    seed: routes,
    mode,
    cascades,
    routeSet: parsed.map((entry) => entry.parsed) as RouteSet<typeof routes>,
    trace: [...trace, ...flowTrace],
    storm: {
      matrix: storm.intersection,
      catalog: stormCatalog,
    },
    templateRows: [...templateFromRoutes, ...templateRows],
    templates: mapTemplateWithTemplateLiteral(rawRouteTemplateSource),
    hierarchy,
    templateRowsCount: templateRows.length,
    score,
  };
};
