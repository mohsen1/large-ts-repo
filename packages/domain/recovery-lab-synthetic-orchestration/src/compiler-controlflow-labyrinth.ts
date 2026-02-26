import {
  buildSolverFactory,
  solveWithFactory,
  type SolverAdapter,
  type SolverOutput,
  type SolverPayload,
} from '@shared/type-level/stress-generic-instantiation-forge';
import {
  parseHyperRoute,
  type HyperRoute,
  type RouteCascade,
  type RouteEnvelope,
  buildRouteCascade,
  resolveRouteGrid,
} from '@shared/type-level/stress-hyper-union';
import { evaluateFlow, evaluateNestedFlow, type FlowInput, type FlowOutcome } from '@shared/type-level/stress-flow-labyrinth';
import { buildClassChain, type ChainClassT } from '@shared/type-level/stress-hierarchy-lattice-cascade';
import { mapTemplateWithTemplateLiteral, rawRouteTemplateSource } from '@shared/type-level/stress-template-route-fabric';

export type FlowMode = 'preview' | 'probe' | 'recover' | 'audit';

export type FlowSummary = Readonly<{
  readonly route: string;
  readonly attempts: number;
  readonly outcome: FlowOutcome['status'];
  readonly branch: FlowOutcome['branch'];
  readonly score: number;
}>;

export type FlowResult = Readonly<{
  readonly id: string;
  readonly route: HyperRoute;
  readonly parsed: RouteEnvelope<HyperRoute>;
  readonly cascade: RouteCascade<HyperRoute, 8>;
  readonly nested: ReturnType<typeof evaluateNestedFlow>;
  readonly direct: ReturnType<typeof evaluateFlow>;
  readonly summary: FlowSummary;
}>;

type AdapterMap = Record<string, SolverAdapter<FlowMode, { readonly ok: boolean; readonly route: string }>>;

type SeverityWeight = Record<RouteEnvelope<HyperRoute>['parsed']['severity'], number>;
const severityWeights = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
  emergency: 13,
  none: 0,
  extreme: 21,
} as const satisfies SeverityWeight;

export const flowMatrixSeeds = [
  'incident:discover:critical:id-d',
  'incident:restore:emergency:id-h',
  'workload:triage:high:id-e',
  'fabric:notify:critical:id-h',
  'policy:triage:critical:id-g',
  'mesh:stabilize:critical:id-f',
  'telemetry:notify:critical:id-b',
  'signal:assess:medium:id-h',
  'continuity:archive:extreme:id-d',
  'compliance:seal:critical:id-c',
] as const satisfies readonly HyperRoute[];

const defaultMode: FlowMode = 'preview';
const adapters: AdapterMap = Object.create(null);
const templateRows = mapTemplateWithTemplateLiteral(rawRouteTemplateSource);

const createFactory = (route: string, mode: FlowMode): SolverAdapter<FlowMode, { readonly ok: boolean; readonly route: string }> => {
  const key = `${route}:${mode}`;
  const existing = adapters[key];
  if (existing) {
    return existing;
  }

  const next = buildSolverFactory(`suite-${route}`, mode, {
    markers: [route, mode],
    namespace: 'flow-labyrinth',
  });

  adapters[key] = next as SolverAdapter<FlowMode, { readonly ok: boolean; readonly route: string }>;
  return next as SolverAdapter<FlowMode, { readonly ok: boolean; readonly route: string }>;
};

export const compileFlowRun = (seed: readonly HyperRoute[], mode: FlowMode = defaultMode): FlowResult[] => {
  const parsed = resolveRouteGrid(seed);
  const cascades = buildRouteCascade(seed, 8);
  const results: FlowResult[] = [];

  for (const [index, route] of seed.entries()) {
    const routeParsed = parsed[index]!;
    const severityWeight = severityWeights[routeParsed.parsed.severity as keyof SeverityWeight] ?? 1;
    const input: FlowInput = {
      kind: (((index * 7) % 50) || 50) as FlowInput['kind'],
      route,
      attempt: index + severityWeight,
      severity: routeParsed.parsed.severity === 'critical' ? 'critical' : 'medium',
    };
    const direct = evaluateFlow(input);
    const nested = evaluateNestedFlow(input);
    const solver = solveWithFactory(
      createFactory(route, mode),
      mode,
      {
        route: `/dispatch/${routeParsed.parsed.template}`,
        markers: [route, direct.reason, nested.reason],
      },
    );
    const summary: FlowSummary = {
      route,
      attempts: index + 1,
      outcome: direct.status,
      branch: direct.branch,
      score: direct.score + direct.trace.length + nested.score + nested.trace.length + solver.trace.length,
    };
    results.push({
      id: `${route}-${index}:${solver.output}`,
      route,
      parsed: routeParsed,
      cascade: cascades[index] as RouteCascade<HyperRoute, 8>,
      nested,
      direct,
      summary,
    });
  }

  return results;
};

export const summarizeFlow = (results: readonly FlowResult[]) => {
  return results.reduce<Record<string, number>>((acc, result) => {
    const key = `${result.summary.outcome}-${result.summary.branch}`;
    acc[key] = (acc[key] ?? 0) + result.summary.score;
    return acc;
  }, {});
};

export const dispatchFlow = (
  route: HyperRoute,
  attempt: number,
  mode: FlowMode = 'probe',
): {
  readonly result: FlowResult;
  readonly dispatch: SolverOutput<FlowMode, { readonly ok: boolean; readonly route: string }>;
} => {
  const base = compileFlowRun([route], mode)[0] as FlowResult;
  const parsed = parseHyperRoute(route);
  const dispatch = solveWithFactory(
    createFactory(route, mode),
    mode,
    {
      route: `/dispatch/${parsed.parsed.template}`,
      markers: [route, parsed.normalized, String(attempt)],
    },
  );
  return { result: base, dispatch };
};

export type DispatchTrace = Map<string, readonly FlowResult[]>;

export const buildDispatchBuckets = (routes: readonly HyperRoute[]): DispatchTrace => {
  const buckets: DispatchTrace = new Map();
  for (const mode of ['preview', 'probe', 'recover', 'audit'] as const) {
    const grouped = compileFlowRun(routes, mode).reduce<Map<string, FlowResult[]>>((acc, entry) => {
      const bucket = acc.get(entry.summary.outcome) ?? [];
      bucket.push(entry);
      acc.set(entry.summary.outcome, bucket);
      return acc;
    }, new Map());
    for (const bucket of grouped.values()) {
      buckets.set(`${mode}:${bucket[0]?.summary.branch ?? 'na'}`, bucket);
    }
  }
  return buckets;
};

export const runFlowScenario = (routes: readonly HyperRoute[] = flowMatrixSeeds) => {
  const compiled = compileFlowRun(routes, 'probe');
  const summary = summarizeFlow(compiled);
  const buckets = buildDispatchBuckets(routes);
  const topBranches = Array.from(buckets.keys()).toSorted().slice(0, 16);
  const chain = buildClassChain('scenario');
  const hierarchy = {
    stage: chain.stage,
    marker: chain.marker,
    tag: chain.tag,
  };
  return {
    summary,
    compiled,
    topBranches,
    templateRows,
    hierarchy,
  };
};
