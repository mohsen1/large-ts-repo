import { Brand, ExpandPluginPath, NoInfer, RecursivePath } from '@shared/type-level';
import { z } from 'zod';

export type ChronicleGraphNamespace = 'chronicle-graph';

export type ChronicleGraphTenantId = Brand<string, 'ChronicleGraphTenantId'>;
export type ChronicleGraphPlanId = Brand<string, 'ChronicleGraphPlanId'>;
export type ChronicleGraphRunId = Brand<string, 'ChronicleGraphRunId'>;
export type ChronicleGraphNodeId = Brand<string, `node:${string}`>;
export type ChronicleGraphEdgeId = Brand<string, `edge:${string}`>;
export type ChronicleGraphPluginId = Brand<string, `plugin:${string}`>;
export type ChronicleGraphRoute<T extends string = string> = `${ChronicleGraphNamespace}://${T}`;
export type ChronicleGraphPhase<T extends string = string> = `phase:${T}`;
export type ChronicleGraphLane<T extends string = string> = `lane:${T}`;

export type ChronicleGraphStatus = 'pending' | 'running' | 'completed' | 'degraded' | 'failed' | 'cancelled';
export type ChronicleGraphSignal = 'bootstrap' | 'discovery' | 'execution' | 'verification' | 'recovery';

export interface ChronicleGraphNode {
  readonly id: ChronicleGraphNodeId;
  readonly name: string;
  readonly lane: ChronicleGraphLane;
  readonly dependsOn: readonly ChronicleGraphNodeId[];
  readonly labels: Record<string, string | number | boolean | null>;
}

export interface ChronicleGraphEdge {
  readonly id: ChronicleGraphEdgeId;
  readonly from: ChronicleGraphNodeId;
  readonly to: ChronicleGraphNodeId;
  readonly weight: number;
  readonly predicates: readonly string[];
}

export interface ChronicleGraphBlueprint {
  readonly id: ChronicleGraphPlanId;
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly title: string;
  readonly description: string;
  readonly nodes: readonly ChronicleGraphNode[];
  readonly edges: readonly ChronicleGraphEdge[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface ChronicleGraphScenario {
  readonly id: ChronicleGraphPlanId;
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly title: string;
  readonly priorities: readonly ChronicleGraphSignal[];
  readonly blueprint: ChronicleGraphBlueprint;
  readonly axis: {
    readonly throughput: number;
    readonly resilience: number;
    readonly cost: number;
    readonly operational: number;
  };
  readonly expectedSeconds: number;
}

export interface ChronicleGraphContext<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenant: ChronicleGraphTenantId;
  readonly runId: ChronicleGraphRunId;
  readonly planId: ChronicleGraphPlanId;
  readonly route: ChronicleGraphRoute;
  readonly timeline: readonly [ChronicleGraphRoute, ChronicleGraphNodeId, ChronicleGraphLane];
  readonly status: ChronicleGraphStatus;
  readonly state: TState;
}

export interface ChronicleGraphObservation<TPayload = unknown> {
  readonly id: ChronicleGraphRunId;
  readonly nodeId: ChronicleGraphNodeId;
  readonly phase: ChronicleGraphPhase;
  readonly route: ChronicleGraphRoute;
  readonly tenant: ChronicleGraphTenantId;
  readonly timestamp: number;
  readonly status: ChronicleGraphStatus;
  readonly payload: TPayload;
}

export interface ChronicleGraphPluginDescriptor<TInput = unknown, TOutput = unknown, TState = unknown> {
  readonly id: ChronicleGraphPluginId;
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly ChronicleGraphPhase[];
  readonly state: TState;
  readonly config: ChronicleGraphPluginPolicy;
  process(input: ChronicleGraphContext<{ readonly pluginInput: TInput }>): Promise<ChronicleGraphObservation<TOutput>>;
}

export interface ChronicleGraphPluginPolicy {
  readonly maxParallelism: number;
  readonly latencyBudgetMs: number;
  readonly fallbackToErrorState: boolean;
}

export interface ChronicleGraphTrace {
  readonly id: ChronicleGraphRunId;
  readonly tenant: ChronicleGraphTenantId;
  readonly plan: ChronicleGraphPlanId;
  readonly phases: readonly ChronicleGraphPhase[];
  readonly startedAt: number;
}

export type ChronicleGraphTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head & PropertyKey, ...ChronicleGraphTuple<Tail>]
  : [];

export type ReverseChronicleGraphTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [...ReverseChronicleGraphTuple<Tail>, Head & PropertyKey]
  : [];

export type PathLookup<T, TPath extends string> = TPath extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? PathLookup<T[Head], Rest>
    : undefined
  : TPath extends keyof T
    ? T[TPath]
    : undefined;

export type PathLookupTuple<T, TPath extends readonly string[]> = TPath extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? PathLookupTuple<PathLookup<T, Head>, Tail>
      : never
    : never
  : T;

export type GraphNodeStateMap<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord as K extends `__${string}` ? never : K]: TRecord[K] extends Record<string, unknown>
    ? TRecord[K]
    : TRecord[K];
};

export type GraphPolicySignature = Brand<string, 'ChronicleGraphPolicyDigest'>;

export type ChronologyNodePaths<T extends Record<string, unknown>> = {
  readonly [K in RecursivePath<T>]: PathLookup<T, K>;
};

export type PluginSequence<TPlugins extends readonly ChronicleGraphPluginDescriptor[]> =
  TPlugins extends readonly [infer Head, ...infer Tail]
    ? Head extends ChronicleGraphPluginDescriptor<unknown, infer TOutput, unknown>
      ? [ChronicleGraphObservation<TOutput>, ...PluginSequence<Tail extends readonly ChronicleGraphPluginDescriptor[] ? Tail : []>]
      : [ChronicleGraphObservation<unknown>]
    : [];

export type PluginResultUnion<TPlugins extends readonly ChronicleGraphPluginDescriptor[]> =
  PluginSequence<TPlugins>[number] extends never ? ChronicleGraphObservation<unknown> : PluginSequence<TPlugins>[number];

export type GraphNodeState<TBlueprint extends ChronicleGraphBlueprint> = {
  readonly [K in TBlueprint['nodes'][number]['id'] as K]: GraphNodeStateMap<{
    readonly id: K;
    readonly inDegree: number;
    readonly outDegree: number;
  }>;
};

const axisSchema = z.object({
  throughput: z.number().min(0),
  resilience: z.number().min(0),
  cost: z.number().min(0),
  operational: z.number().min(0),
});

const scenarioSchema = z.object({
  tenant: z.string().min(3),
  route: z.string().min(8),
  title: z.string().min(3),
  priorities: z.array(z.string()).default(['bootstrap', 'discovery']),
  expectedSeconds: z.number().nonnegative().default(180),
});

const normalizeAxis = (value: number): number => Math.max(0, Math.min(1, value));

const graphBrand = (value: string): ChronicleGraphNamespace => {
  if (value.length === 0) return 'chronicle-graph';
  return 'chronicle-graph';
};

export const asChronicleGraphId = (value: string): ChronicleGraphNamespace => graphBrand(value);
export const asChronicleGraphTenantId = (value: string): ChronicleGraphTenantId => `tenant:${value}` as ChronicleGraphTenantId;
export const asChronicleGraphPlanId = (value: string): ChronicleGraphPlanId => `plan:${value}` as ChronicleGraphPlanId;
export const asChronicleGraphRunId = (tenant: ChronicleGraphTenantId, route: ChronicleGraphRoute): ChronicleGraphRunId =>
  `${tenant}:${route}:${Date.now()}` as ChronicleGraphRunId;
export const asChronicleGraphNodeId = (value: string): ChronicleGraphNodeId => `node:${value}` as ChronicleGraphNodeId;
export const asChronicleGraphEdgeId = (value: string): ChronicleGraphEdgeId => `edge:${value}` as ChronicleGraphEdgeId;
export const asChronicleGraphPluginId = (value: string): ChronicleGraphPluginId => `plugin:${value}` as ChronicleGraphPluginId;
export const asChronicleGraphRoute = <T extends string>(value: T): ChronicleGraphRoute<T> =>
  `chronicle-graph://${value}` as ChronicleGraphRoute<T>;
export const asChronicleGraphPhase = <T extends string>(value: T): ChronicleGraphPhase<T> => `phase:${value}` as ChronicleGraphPhase<T>;
export const asChronicleGraphLane = <T extends string>(value: T): ChronicleGraphLane<T> => `lane:${value}` as ChronicleGraphLane<T>;

export const asChronicleRunId = asChronicleGraphRunId;
export const asChronicleTenantId = asChronicleGraphTenantId;
export const asChronicleRoute = asChronicleGraphRoute;
export const asChroniclePhase = asChronicleGraphPhase;
export const asChronicleLane = asChronicleGraphLane;
export const asChroniclePlanId = asChronicleGraphPlanId;
export const asChronicleNode = asChronicleGraphNodeId;
export const asChroniclePluginId = asChronicleGraphPluginId;

export const buildTrace = (tenant: ChronicleGraphTenantId, plan: ChronicleGraphPlanId, route: ChronicleGraphRoute): ChronicleGraphTrace => ({
  id: asChronicleGraphRunId(tenant, route),
  tenant,
  plan,
  phases: [
    asChronicleGraphPhase('bootstrap'),
    asChronicleGraphPhase('discovery'),
    asChronicleGraphPhase('execution'),
    asChronicleGraphPhase('verification'),
    asChronicleGraphPhase('recovery'),
  ],
  startedAt: Date.now(),
});

export const normalizeAxisTuple = (axis: ChronicleGraphScenario['axis']): ChronicleGraphScenario['axis'] => ({
  throughput: normalizeAxis(axis.throughput),
  resilience: normalizeAxis(axis.resilience),
  cost: normalizeAxis(axis.cost),
  operational: normalizeAxis(axis.operational),
});

export const sanitizeBlueprintNodes = <TBlueprint extends ChronicleGraphBlueprint>(
  blueprint: NoInfer<TBlueprint>,
): TBlueprint => {
  const orderedNodes = [...blueprint.nodes].toSorted((left, right) => String(left.name).localeCompare(String(right.name)));
  return {
    ...blueprint,
    nodes: orderedNodes,
    edges: [...blueprint.edges].toSorted((left, right) => left.weight - right.weight),
  } as TBlueprint;
};

export const graphTuple = <T extends readonly unknown[]>(value: T): ChronicleGraphTuple<T> =>
  value as unknown as ChronicleGraphTuple<T>;

export const reverseGraphTuple = <T extends readonly unknown[]>(value: T): ReverseChronicleGraphTuple<T> =>
  [...value].reverse() as ReverseChronicleGraphTuple<T>;

export const inferTuple = <
  T extends readonly unknown[],
  TPrefix extends readonly unknown[] = [],
>(prefix: TPrefix, tuple: T): {
  readonly prefix: TPrefix;
  readonly tuple: T;
} => ({
  prefix,
  tuple,
});

export const expandGraphPaths = <T extends Record<string, unknown>>(record: NoInfer<T>): ChronologyNodePaths<T> => {
  return {} as ChronologyNodePaths<T>;
};

export const validateScenarioInput = (input: unknown): ChronicleGraphScenario | undefined => {
  const parsed = scenarioSchema.safeParse(input);
  if (!parsed.success) return undefined;

  const tenant = asChronicleGraphTenantId(parsed.data.tenant);
  const route = asChronicleGraphRoute(parsed.data.route);
  const axis = axisSchema.parse({ throughput: 1, resilience: 1, cost: 0.4, operational: 0.6 });

  return {
    id: asChronicleGraphPlanId(`${tenant}:${route}`),
    tenant,
    route,
    title: parsed.data.title,
    priorities: parsed.data.priorities as ChronicleGraphSignal[],
    axis,
    expectedSeconds: parsed.data.expectedSeconds,
    blueprint: {
      id: asChronicleGraphPlanId(`${tenant}:${route}`),
      tenant,
      route,
      title: 'seed',
      description: 'runtime seed blueprint',
      nodes: [
        {
          id: asChronicleGraphNodeId('seed'),
          name: 'seed',
          lane: asChronicleGraphLane('control'),
          dependsOn: [],
          labels: { kind: 'seed', generated: true },
        },
      ],
      edges: [],
    },
  };
};

export const asPolicyContext = (
  tenant: ChronicleGraphTenantId,
  route: ChronicleGraphRoute,
  blueprint: ChronicleGraphBlueprint,
  pluginInput: unknown = undefined,
): ChronicleGraphContext<{ readonly pluginInput: unknown; readonly policy: string; readonly nodeCount: number; readonly edgeCount: number }> => ({
  tenant,
  runId: asChronicleGraphRunId(tenant, route),
  planId: blueprint.id,
  route,
  timeline: [route, asChronicleGraphNodeId('bootstrap'), asChronicleGraphLane('control')],
  status: 'running',
  state: {
    pluginInput,
    policy: blueprint.title,
    nodeCount: blueprint.nodes.length,
    edgeCount: blueprint.edges.length,
  },
});

export const asScenarioFromParts = <TParts extends ChronicleGraphScenario>(
  parts: NoInfer<TParts>,
): TParts => {
  const nodeIds = parts.blueprint.nodes.map((node) => node.id);
  const inferred = {
    ...parts,
    axis: normalizeAxisTuple(parts.axis),
    expectedSeconds: parts.expectedSeconds,
    blueprint: sanitizeBlueprintNodes(parts.blueprint),
    priorities: parts.priorities.length === 0 ? (['bootstrap', 'execution'] as const) : parts.priorities,
    id: parts.id,
    route: parts.route,
  } satisfies Omit<TParts, 'id'> & { readonly id: ChronicleGraphPlanId };

  const [firstNode] = nodeIds;
  const timelineLane = inferred.blueprint.nodes.at(0)?.lane ?? asChronicleGraphLane('control');

  return {
    ...inferred,
    route: asChronicleGraphRoute(inferred.route),
    id: inferred.id,
    timelineHint: [firstNode ?? asChronicleGraphNodeId('seed'), timelineLane, parts.route],
  } as TParts;
};

export const collectBlueprintIds = <TBlueprint extends ChronicleGraphBlueprint>(
  blueprint: TBlueprint,
): readonly string[] => blueprint.nodes.map((node) => node.id);

export const mapNodeById = <TBlueprint extends ChronicleGraphBlueprint>(
  blueprint: NoInfer<TBlueprint>,
): Record<string, TBlueprint['nodes'][number]> => {
  return blueprint.nodes.reduce<Record<string, TBlueprint['nodes'][number]>>((acc, node) => {
    acc[String(node.id)] = node;
    return acc;
  }, {});
};
