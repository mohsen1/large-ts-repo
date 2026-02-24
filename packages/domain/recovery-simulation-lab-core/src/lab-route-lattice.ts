import { asLabScenarioId, asLabTenantId, asLabRunId } from '@shared/recovery-lab-kernel';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import { createDisposableScope, collect, mapIterator } from '@shared/recovery-lab-kernel';
import type { NoInfer } from '@shared/type-level';
import type { LabExecutionResult, LabLane, LabPlanTemplate, LabScenario, ScenarioSignal } from './models';

export type LatticeLane = LabLane | 'unknown';
export type RouteSeed = `${string}::${string}`;
export type RouteScope<T extends string = string> = T extends `${infer Prefix}/${infer Suffix}`
  ? `${Prefix}` | `${Prefix}/${RouteScope<Suffix>}`
  : T;

export type RoutePair<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [RouteScope<Head>, ...RoutePair<Extract<Tail, readonly string[]>>]
    : readonly []
  : readonly [];

export type RouteTuple<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [
      RouteScope<Head>,
      ...RouteTuple<Extract<Tail, readonly string[]>>,
    ]
  : readonly []
  : readonly [];

export type LatticeNodeId = Brand<string, 'LatticeNodeId'>;
export type LatticeRoute = Brand<string, 'LatticeRoute'>;
export type LatticePath = LatticeRoute;

export type SignalValueMap<TSignals extends readonly ScenarioSignal[]> = {
  [K in TSignals[number] as K['name'] & string]: K['value'];
};

export interface LatticeNode {
  readonly id: LatticeNodeId;
  readonly route: LatticeRoute;
  readonly lane: LatticeLane;
  readonly score: number;
  readonly timestamp: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LatticeRouteEdge {
  readonly from: LatticeNodeId;
  readonly to: LatticeNodeId;
  readonly path: LatticePath;
  readonly weight: number;
  readonly tags: readonly string[];
}

export interface LatticePlanInput {
  readonly tenant: string;
  readonly scenarioId: string;
  readonly plans: readonly LabPlanTemplate[];
  readonly signals: readonly ScenarioSignal[];
  readonly lane?: LatticeLane;
}

export interface LatticePlanSnapshot {
  readonly tenant: string;
  readonly scenarioId: string;
  readonly routeCount: number;
  readonly totalWeight: number;
  readonly routeKeys: readonly LatticePath[];
  readonly tags: readonly string[];
}

export interface LatticePlanDiagnostics {
  readonly route: LatticePath;
  readonly score: number;
  readonly events: readonly string[];
  readonly manifest: RouteManifest;
}

export interface RouteManifest {
  readonly tenant: string;
  readonly routes: ReadonlyMap<LatticePath, readonly LatticeRouteEdge[]>;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly generatedAt: number;
}

interface RouteNode {
  readonly id: LatticeNodeId;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface RouteManifestEntry {
  readonly path: LatticePath;
  readonly weight: number;
  readonly edges: readonly LatticeRouteEdge[];
  readonly lane: LabLane;
}

const lanePriority = ['ingest', 'simulate', 'verify', 'restore', 'report'] as const satisfies readonly LabLane[];
const KNOWN_LANES = new Set<LabLane>(['ingest', 'simulate', 'verify', 'restore', 'report']);
const asLabLane = (lane: LatticeLane): LabLane => (KNOWN_LANES.has(lane as LabLane) ? (lane as LabLane) : 'simulate');
const normalizeLane = (lane: string): LatticeLane => {
  return (KNOWN_LANES.has(lane as LabLane) ? (lane as LatticeLane) : 'unknown') as LatticeLane;
};

const asNodeId = (value: string): LatticeNodeId => withBrand(value, 'LatticeNodeId');
const asLatticeRoute = (value: string): LatticeRoute => withBrand(value, 'LatticeRoute');
const asLatticePath = (value: string): LatticePath => withBrand(value, 'LatticeRoute');
const asRoutePair = <T extends readonly string[]>(values: T): RouteTuple<T> => values as never;

const byLanePriority = (left: { readonly lane: LatticeLane }, right: { readonly lane: LatticeLane }): number => {
  return lanePriority.indexOf(asLabLane(left.lane)) - lanePriority.indexOf(asLabLane(right.lane));
};

const toRouteSeed = (tenant: string, value: string, size = 1): RouteSeed => `${tenant}::${value}::${size}` as RouteSeed;

export const defaultTenant = 'tenant-lab-orchestration';
export const defaultRouteSeed = toRouteSeed(defaultTenant, 'bootstrap', 3);

export class RecoveryPlanLattice {
  readonly #tenant: string;
  readonly #seed: string;
  readonly #nodes = new Map<LatticeNodeId, LatticeNode>();
  readonly #edges = new Map<LatticeNodeId, readonly LatticeRouteEdge[]>();
  readonly #routes = new Map<LatticePath, readonly LatticeNodeId[]>();

  public constructor(tenant: string, seed = `${tenant}-${Date.now()}`) {
    this.#tenant = tenant;
    this.#seed = seed;
  }

  public bootstrap<TInput extends NoInfer<LatticePlanInput>>(input: TInput): LatticePlanSnapshot {
    const tenant = asLabTenantId(input.tenant);
    const scenarioId = asLabScenarioId(input.scenarioId);

    const signals = [...input.signals].map((signal) => ({
      ...signal,
      lane: normalizeLane(signal.lane),
      name: `${tenant}/${signal.lane}/${signal.name}`,
    }));

    const routeList = this.createLaneRoutes(`${scenarioId}`, this.groupByLane(signals));
    for (const route of routeList) {
      const routeId = asLatticeRoute(route.key);
      const nodeIds = route.nodes.map((node) => node.id);
      this.#routes.set(routeId, nodeIds);

      for (const [index, node] of nodeIds.entries()) {
        this.#nodes.set(node, {
          id: node,
          route: routeId,
          lane: route.lane,
          score: Math.max(1, route.nodes.length - index),
          timestamp: Date.now() + index,
          metadata: {
            tenant,
            scenario: `${scenarioId}`,
            source: route.key,
          },
        });

        if (index === 0) {
          continue;
        }

        const from = nodeIds[index - 1];
        const nextEdge: LatticeRouteEdge = {
          from,
          to: node,
          path: asLatticePath(`${from}::${node}::${index}`),
          weight: route.lane === 'simulate' ? 2 : 1.2,
          tags: [route.key, `${route.lane}`, `${index}`],
        };

        const existing = this.#edges.get(from) ?? [];
        this.#edges.set(from, [...existing, nextEdge]);
      }
    }

    if (input.lane) {
      this.attachSignal(
        {
          name: `${tenant}/${input.lane}/bootstrap`,
          lane: asLabLane(input.lane),
          severity: 'low',
          value: 1,
          createdAt: new Date().toISOString(),
        },
        {
          tenant,
          scenarioId,
          stepIds: asRoutePair([`${input.lane}`, `${tenant}`, `${scenarioId}`]),
          expectedMs: this.#nodes.size * 10,
          requires: [((asLabScenarioId(scenarioId) as unknown) as Brand<string, 'ScenarioId'>)],
          canary: false,
        },
      );
    }

    return {
      tenant: `${tenant}`,
      scenarioId: `${scenarioId}`,
      routeCount: this.#routes.size,
      totalWeight: [...this.#nodes.values()].reduce((acc, node) => acc + node.score, 0),
      routeKeys: [...this.#routes.keys()],
      tags: this.summarizeTags(input.plans),
    };
  }

  public attachSignal(signal: ScenarioSignal, plan: LabPlanTemplate): void {
    const route = asLatticeRoute(`${plan.tenant}::${plan.scenarioId}::${signal.name}`);
    const nodes = this.ensureRouteNodes(route, signal.lane);

    const seedNode = nodes.at(0);
    const tailNode = nodes.at(-1);

    if (!seedNode || !tailNode) {
      return;
    }

    const edge: LatticeRouteEdge = {
      from: seedNode.id,
      to: tailNode.id,
      path: asLatticePath(`${seedNode.id}::${tailNode.id}`),
      weight: plan.expectedMs / 1000,
      tags: [`signal:${signal.name}`, `severity:${signal.severity}`],
    };

    this.#edges.set(seedNode.id, [...(this.#edges.get(seedNode.id) ?? []), edge]);
  }

  public buildManifest(): RouteManifest {
    const routeItems = [...this.#routes.entries()];
    const allEdges = collect(mapIterator(routeItems, ([path]) => this.routeEdges(path)));
    const routes = new Map<LatticePath, readonly LatticeRouteEdge[]>(
      routeItems.map(([path]) => [path, this.routeEdges(path)]),
    );

    return {
      tenant: this.#tenant,
      routes,
      nodeCount: this.#nodes.size,
      edgeCount: allEdges.reduce((acc, entry) => acc + entry.length, 0),
      generatedAt: Date.now(),
    };
  }

  public trace<TState extends LatticeLane>(state: TState, result: LabExecutionResult): LatticePlanDiagnostics {
    const route = asLatticePath(`${this.#seed}::${state}`);
    const events = collect(mapIterator(this.#routes.entries(), ([path, nodeIds]) => `${path}|${nodeIds.length}`))
      .toSorted((left, right) => left.localeCompare(right));

    return {
      route,
      score: result.health,
      events: this.sanitizeEvents([...events, ...result.steps.map((step) => step.message)]),
      manifest: this.buildManifest(),
    };
  }

  public buildRoutes(): readonly RouteManifestEntry[] {
    return collect(mapIterator([...this.buildManifest().routes.entries()], ([path, edges]) => ({
      path,
      weight: edges.reduce((acc, edge) => acc + edge.weight, 0),
      edges,
      lane: inferLaneFromPath(path),
    }))).toSorted((left, right) => byLanePriority({ lane: left.lane }, { lane: right.lane }));
  }

  public buildLatticeScope(): readonly string[] {
    return [...this.#routes.keys()].map((path) => `${path}`).toSorted();
  }

  public [Symbol.dispose](): void {
    this.#nodes.clear();
    this.#edges.clear();
    this.#routes.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await using _scope = createDisposableScope();
    this.#nodes.clear();
    this.#edges.clear();
    this.#routes.clear();
  }

  private groupByLane(signals: readonly { readonly lane: LatticeLane; readonly name: string }[]): Record<LatticeLane, readonly string[]> {
    const buckets = new Map<LatticeLane, string[]>();

    for (const signal of signals) {
      const lane = normalizeLane(signal.lane);
      buckets.set(lane, [...(buckets.get(lane) ?? []), signal.name]);
    }

    return {
      ingest: buckets.get('ingest') ?? [],
      simulate: buckets.get('simulate') ?? [],
      verify: buckets.get('verify') ?? [],
      restore: buckets.get('restore') ?? [],
      report: buckets.get('report') ?? [],
      unknown: buckets.get('unknown') ?? [],
    };
  }

  private createLaneRoutes(
    scenarioId: string,
    laneBuckets: Record<LatticeLane, readonly string[]>,
  ): readonly { lane: LatticeLane; key: string; nodes: readonly RouteNode[] }[] {
    const entries = Object.entries(laneBuckets) as readonly [LatticeLane, readonly string[]][];
    const routeTuples = entries.map(([lane, items], index) => {
      const normalizedLane = normalizeLane(lane);
      const nodes = items
        .toSorted((left, right) => left.localeCompare(right))
        .map((entry, offset) => ({
          id: asNodeId(`${scenarioId}::${normalizedLane}::${index}::${offset}::${entry}`),
          metadata: {
            step: offset,
            item: entry,
          },
        }));

      return {
        lane: normalizedLane,
        key: `${scenarioId}::${normalizedLane}`,
        nodes,
      };
    });

    return collect(mapIterator(routeTuples, (entry) => entry))
      .toSorted((left, right) => byLanePriority(left, right));
  }

  private ensureRouteNodes(route: LatticeRoute, lane: LatticeLane): readonly { id: LatticeNodeId; lane: LatticeLane }[] {
    const existing = [...this.#nodes.values()].filter((node) => node.route === route);
    if (existing.length > 0) {
      return existing.map((node) => ({ id: node.id, lane: node.lane }));
    }

    const parts = `${route}`.split('::');
    const fallback: { id: LatticeNodeId; lane: LatticeLane }[] = parts.map((entry, index) => ({
      id: asNodeId(`${route}::${index}::${entry}`),
      lane: normalizeLane(lane),
    }));

    for (const node of fallback) {
      this.#nodes.set(node.id, {
        id: node.id,
        route,
        lane: node.lane,
        score: Math.max(1, fallback.length - Number(`${node.id}`.length % Math.max(1, fallback.length))),
        timestamp: Date.now(),
        metadata: {
          planRoute: route,
        },
      });
    }

    return fallback;
  }

  private summarizeTags(plans: readonly LabPlanTemplate[]): readonly string[] {
    const tags = new Set<string>();
    for (const plan of plans) {
      tags.add(`tenant:${plan.tenant}`);
      tags.add(`scenario:${plan.scenarioId}`);
      tags.add(`steps:${plan.stepIds.length}`);
      tags.add(`expected:${plan.expectedMs}`);
      if (plan.canary) {
        tags.add('canary');
      }
    }
    return [...tags];
  }

  private routeEdges(route: LatticePath): readonly LatticeRouteEdge[] {
    const routeNodes = this.#routes.get(route) ?? [];
    const edges: LatticeRouteEdge[] = [];
    for (const [index, nodeId] of routeNodes.entries()) {
      const next = routeNodes[index + 1];
      if (!next) {
        continue;
      }

      edges.push({
        from: nodeId,
        to: next,
        path: asLatticePath(`${route}::${nodeId}:${next}`),
        weight: `${nodeId}`.includes('simulate') ? 3 : 1.2,
        tags: ['path', `${index}`],
      });
    }
    return edges;
  }

  private sanitizeEvents(events: readonly string[]): readonly string[] {
    const seen = new Map<string, number>();
    for (const event of events) {
      const key = event.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    return [...seen.entries()]
      .map(([label, count]) => `${label}:count=${count}`)
      .toSorted((left, right) => right.localeCompare(left));
  }
}

const inferLaneFromPath = (path: LatticePath): LabLane => {
  const value = `${path}`;
  if (value.includes('ingest')) {
    return 'ingest';
  }
  if (value.includes('simulate')) {
    return 'simulate';
  }
  if (value.includes('verify')) {
    return 'verify';
  }
  if (value.includes('restore')) {
    return 'restore';
  }
  if (value.includes('report')) {
    return 'report';
  }
  return 'simulate';
};

export const routeByPlan = <TPlans extends readonly LabPlanTemplate[]>(
  plans: TPlans,
): ReadonlyMap<LatticePath, RouteSeed> => {
  const rows = plans.toSorted((left, right) => left.scenarioId.localeCompare(right.scenarioId));
  const mapped = rows.map((plan, index) => {
    const route = asLatticeRoute(`${plan.tenant}::${plan.scenarioId}::${index}`);
    const seed = toRouteSeed(`${plan.tenant}`, `${plan.scenarioId}`, plan.expectedMs);
    return [route, seed] as const;
  });

  return new Map(mapped);
};

export const buildLatticeFromScenarios = <TScenario extends LabScenario, TPlans extends readonly LabPlanTemplate[]>(
  scenario: TScenario,
  plans: NoInfer<TPlans>,
): RecoveryPlanLattice => {
  const lattice = new RecoveryPlanLattice(`${scenario.tenant}`);
  lattice.bootstrap({
    tenant: `${scenario.tenant}`,
    scenarioId: `${scenario.scenarioId}`,
    plans,
    signals: scenario.signals,
    lane: scenario.lane,
  });

  for (const plan of plans) {
    const signal = scenario.signals.at(0);
    if (signal) {
      lattice.attachSignal(signal, plan);
    }
  }

  return lattice;
};

export const extractRouteSignals = <
  TScenarios extends readonly LabScenario[],
  TPlanTemplates extends readonly LabPlanTemplate[],
>(
  scenarios: TScenarios,
  plans: TPlanTemplates,
): SignalValueMap<[
  {
    readonly name: string;
    readonly lane: LabLane;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly value: number;
    readonly createdAt: string;
  },
]> => {
  const map: Record<string, number> = {};
  for (const scenario of scenarios) {
    for (const signal of scenario.signals) {
      map[`${scenario.scenarioId}:${signal.name}`] = (map[`${scenario.scenarioId}:${signal.name}`] ?? 0) + signal.value;
    }
  }

  for (const plan of plans) {
    map[`${plan.scenarioId}-steps`] = Math.max(
      map[`${plan.scenarioId}-steps`] ?? 0,
      plan.stepIds.length,
    );
  }

  return map as SignalValueMap<[
    {
      readonly name: string;
      readonly lane: LabLane;
      readonly severity: 'low' | 'medium' | 'high' | 'critical';
      readonly value: number;
      readonly createdAt: string;
    }
  ]>;
};

export const normalizeRouteMap = <
  TMap extends ReadonlyMap<LatticePath, readonly string[]>,
>(routes: TMap): ReadonlyMap<LatticePath, readonly string[]> => {
  const normalized = [...routes.entries()].map(([path, values]) => [path, values.toSorted()] as const);
  const flattened = collect(
    mapIterator(
      normalized,
      ([path, values]) =>
        [
          asLatticePath(`${path}::${values.length}`),
          values.toSorted(),
        ] as const,
    ),
  );

  return new Map(flattened);
};

export const summarizeSignalRoutes = (
  scenarios: readonly LabScenario[],
  plans: readonly LabPlanTemplate[],
): readonly { readonly tenant: string; readonly route: string; readonly score: number }[] =>
  scenarios
    .toSorted((left, right) => `${left.tenant}`.length - `${right.tenant}`.length)
    .flatMap((scenario) => {
      const route = buildLatticeFromScenarios(scenario, plans);
      const manifest = route.buildManifest();
      return [...manifest.routes.keys()].map((path) => ({
        tenant: `${scenario.tenant}`,
        route: `${path}`,
        score: manifest.nodeCount / Math.max(1, manifest.edgeCount),
      }));
    });

const routeSeedBuild = (scenario: LabScenario): RouteSeed => toRouteSeed(`${scenario.tenant}`, `${scenario.scenarioId}`, asLabRunId(`${scenario.scenarioId}`).length);

export const routeBySeed = (tenant: string, scenario: string, seed = Date.now()): RouteSeed => {
  return `${asLabTenantId(tenant)}::${scenario}::${seed}` as RouteSeed;
};

export const defaultRoutePlan = (scenario: LabScenario): RouteSeed => routeSeedBuild(scenario);
