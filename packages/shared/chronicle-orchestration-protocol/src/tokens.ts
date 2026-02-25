import { NoInfer, type ExpandPluginPath, type RecursivePath } from '@shared/type-level';

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ReadonlyDeep<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<ReadonlyDeep<U>>
    : T extends Record<string, unknown>
      ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
      : T;

const asReadonly = <T>(value: T): ReadonlyDeep<T> => value as ReadonlyDeep<T>;

export const normalizeLimit = (limit = 500): number => {
  if (!Number.isFinite(limit)) return 0;
  return Math.max(1, Math.floor(limit));
};

export type ChronicleEventKind = 'boot' | 'signal' | 'policy' | 'verify' | 'finalize';
export type ChroniclePhase = `phase:${ChronicleEventKind}`;
export type ChronicleMetricAxis = 'throughput' | 'latency' | 'resiliency' | 'coverage' | `axis:${string}`;
export type ChronicleStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'degraded' | 'failed';
export type TimelineAxis = Extract<ChronicleMetricAxis, `axis:${string}`>;

export type ChronicleTenantId = Brand<`tenant:${string}`, 'ChronicleTenantId'>;
export type ChronicleRoute = Brand<`chronicle://${string}`, 'ChronicleRoute'>;
export type ChronicleRunId = Brand<`run:${string}`, 'ChronicleRunId'>;
export type ChroniclePlanId = Brand<`plan:${string}`, 'ChroniclePlanId'>;
export type ChronicleStepId = Brand<`step:${string}`, 'ChronicleStepId'>;
export type ChroniclePluginId = Brand<`plugin:${string}`, 'ChroniclePluginId'>;
export type ChronicleTag = Brand<`tag:${string}`, 'ChronicleTag'>;
export type TopologyNodeId = Brand<`node:${string}`, 'TopologyNodeId'>;

export type EventMap<T extends Record<string, number>> = {
  [K in keyof T as `metric:${Extract<K, string>}`]: T[K];
};

export type RecursiveTuple<T, N extends number, A extends readonly T[] = []> = A['length'] extends N
  ? A
  : RecursiveTuple<T, N, [...A, T]>;

export type RecursiveTupleOf<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head & PropertyKey, ...RecursiveTupleOf<Tail & readonly unknown[]>]
  : [];

export type PluginPath<T extends Record<string, unknown>> = RecursivePath<T> | ExpandPluginPath<T>;
export type MergeWithTimestamp<T> = Readonly<T & { readonly createdAt: number }>;
export type EventEnvelope<T> = MergeWithTimestamp<T>;

export interface ChroniclePluginState {
  readonly version: `${number}.${number}.${number}`;
  readonly active: boolean;
  readonly retries: number;
  readonly latencyBudgetMs: number;
  readonly labels: readonly ChronicleTag[];
  readonly config: {
    readonly maxParallelism: number;
    readonly timeoutMs: number;
    readonly tags: readonly ChronicleTag[];
  };
}

export interface ChroniclePluginInput<TInput = unknown> {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly runId: ChronicleRunId;
  readonly payload: TInput;
  readonly signal: AbortSignal;
  readonly metadata: Readonly<Record<string, string>>;
  readonly requestedBy: ChronicleTag;
}

export interface ChroniclePluginResult<TPayload = unknown> {
  readonly stepId: ChronicleStepId;
  readonly status: ChronicleStatus;
  readonly latencyMs: number;
  readonly score: number;
  readonly payload: ReadonlyDeep<TPayload>;
}

export type StageWeights = {
  readonly [K in ChronicleEventKind]: number;
};

export type ChroniclePluginDescriptor<
  TId extends `plugin:${string}` = `plugin:${string}`,
  TInput = unknown,
  TOutput = unknown,
  TState extends ChroniclePluginState = ChroniclePluginState,
> = {
  readonly id: Brand<TId, 'ChroniclePluginId'>;
  readonly name: string;
  readonly version: ChroniclePluginState['version'];
  readonly supports: readonly ChroniclePhase[];
  readonly state: TState;
  readonly process: (input: ChroniclePluginInput<TInput>) => Promise<ChroniclePluginResult<TOutput>>;
};

export interface ChronicleTimelinePoint {
  readonly stepId: ChronicleStepId;
  readonly phase: ChroniclePhase;
  readonly score: number;
  readonly status: ChronicleStatus;
}

export interface ChronicleTopologyNode {
  readonly id: TopologyNodeId;
  readonly label: string;
  readonly phase: ChroniclePhase;
  readonly scope: string;
}

export interface ChronicleTopologyEdge {
  readonly from: TopologyNodeId;
  readonly to: TopologyNodeId;
  readonly delayMs: number;
}

export interface ChronicleTopologyGraph {
  readonly route: ChronicleRoute;
  readonly nodes: readonly ChronicleTopologyNode[];
  readonly edges: readonly ChronicleTopologyEdge[];
}

export type TopologyNode = ChronicleTopologyNode;
export type TopologyEdge = ChronicleTopologyEdge;
export type TopologyGraph = ChronicleTopologyGraph;

export interface ChroniclePaged<T> {
  readonly tenant: ChronicleTenantId;
  readonly items: readonly T[];
}

export interface TimelineEnvelope<TPayload = unknown> extends EventEnvelope<{
  readonly route: ChronicleRoute;
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly payload: TPayload;
}> {}

export type ChroniclePluginCatalog = Record<ChroniclePluginId, ChroniclePluginDescriptor>;

type SupportsPhase<TDescriptor, TPhase extends ChroniclePhase> = TDescriptor extends { readonly supports: readonly TPhase[] }
  ? true
  : TDescriptor extends { readonly supports: readonly ChroniclePhase[] }
    ? TDescriptor['supports'][number] extends TPhase
      ? true
      : false
    : false;

export type PluginStateByPhase<TCatalog extends ChroniclePluginCatalog, TPhase extends ChroniclePhase> = {
  [K in keyof TCatalog as SupportsPhase<TCatalog[K], TPhase> extends true ? K : never]: TCatalog[K];
};

export const asChronicleTenantId = (tenantId: string): ChronicleTenantId =>
  asReadonly(`tenant:${normalizeId(tenantId)}`) as ChronicleTenantId;

export const asChronicleRouteBase = (value: string): ChronicleRoute => {
  const normalized = value.startsWith('chronicle://') ? value.slice('chronicle://'.length) : value;
  return `chronicle://${normalized}` as ChronicleRoute;
};

export const asChronicleRoute = (route: string): ChronicleRoute =>
  asChronicleRouteBase(route.startsWith('chronicle://') ? route : `chronicle://${route}`);

export const asChronicleRunId = (tenant: ChronicleTenantId, route: ChronicleRoute): ChronicleRunId =>
  asReadonly(`run:${String(tenant)}:${String(route)}`) as ChronicleRunId;

export const asChroniclePlanId = (tenant: ChronicleTenantId, route: ChronicleRoute): ChroniclePlanId =>
  asReadonly(`plan:${String(tenant)}:${String(route)}`) as ChroniclePlanId;

export const asChronicleStepId = (id: string): ChronicleStepId => asReadonly(`step:${normalizeId(id)}`) as ChronicleStepId;

export const asChroniclePluginId = (id: string): ChroniclePluginId =>
  asReadonly(`plugin:${normalizeId(id)}`) as ChroniclePluginId;

export const asChronicleTag = <T extends string>(tag: T): ChronicleTag =>
  `tag:${normalizeId(tag)}` as ChronicleTag;

export const asChronicleScope = (value: string): ChronicleTag => asChronicleTag(`scope:${normalizeId(value)}`);
export const buildChronicleScope = asChronicleScope;

export const asStatus = (status: string): ChronicleStatus =>
  status === 'queued' ||
  status === 'running' ||
  status === 'succeeded' ||
  status === 'degraded' ||
  status === 'failed'
    ? (status as ChronicleStatus)
    : 'idle';

export const asRouteFromPhase = (phase: ChronicleEventKind): ChroniclePhase => `phase:${phase}` as ChroniclePhase;

export const asTimelineNodeId = (route: ChronicleRoute, phase: ChroniclePhase, index: number): TopologyNodeId =>
  asReadonly(`node:${route}:${phase}:${index}`) as TopologyNodeId;

export const phaseWeights: StageWeights = {
  boot: 1,
  signal: 2,
  policy: 3,
  verify: 4,
  finalize: 5,
} as const satisfies StageWeights;

export const toMetricKey = <T extends PropertyKey>(axis: T): `metric:${Extract<T, string>}` =>
  `metric:${String(axis)}` as `metric:${Extract<T, string>}`;

export const timelineSummary = (points: readonly ChronicleTimelinePoint[]): Readonly<Record<ChronicleStatus, number>> => {
  const summary: Record<ChronicleStatus, number> = {
    idle: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    degraded: 0,
    failed: 0,
  };
  points.forEach((point) => {
    summary[point.status] += 1;
  });
  return summary;
};

export const estimateScore = (items: readonly number[]): number =>
  items.length === 0 ? 0 : items.reduce((left, right) => left + right, 0) / items.length;

export const buildDefaultLimits = async (): Promise<readonly number[]> => {
  await Promise.resolve();
  return [normalizeLimit(64), normalizeLimit(128), normalizeLimit(512)] as const;
};

export const buildRouteCatalog = (raw: Iterable<string>): readonly ChronicleRoute[] => {
  const values = [...raw].map((value) => asChronicleRoute(value));
  return values.toSorted((left, right) => right.localeCompare(left));
};

export const normalizePluginTuple = <T extends readonly ChroniclePluginDescriptor[]>(
  plugins: NoInfer<T>,
): RecursiveTupleOf<T> => (plugins as unknown) as RecursiveTupleOf<T>;

export const defaultRouteSamples = buildRouteCatalog([
  'fabric',
  'mesh',
  'studio',
  'timeline',
  'observability',
]);

export const defaultRouteCatalog = await (async () => {
  const limits = await buildDefaultLimits();
  return buildRouteCatalog([
    ...defaultRouteSamples,
    ...limits.map((limit) => `chronicle://fabric/${limit}`),
  ]);
})();

export const pluginPaths = <T extends Record<string, unknown>>(value: T): readonly PluginPath<T>[] => {
  const keys = Object.keys(value as Record<string, unknown>);
  return (keys as unknown) as readonly PluginPath<T>[];
};

const normalizeId = (value: string): string => value.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
