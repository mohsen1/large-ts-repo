import {
  Brand,
  DeepReadonlyMap,
  ExpandPluginPath,
  NoInfer,
  RecursivePath,
} from '@shared/type-level';
import { z } from 'zod';

export type ChronicleId = Brand<string, 'ChronicleId'>;
export type ChronicleTenantId = Brand<string, 'ChronicleTenantId'>;
export type ChroniclePlanId = Brand<string, 'ChroniclePlanId'>;
export type ChronicleRunId = Brand<string, 'ChronicleRunId'>;
export type ChroniclePluginId = Brand<string, 'ChroniclePluginId'>;
export type ChronicleStepId = Brand<string, 'ChronicleStepId'>;

export type ChronicleRoute<T extends string = string> = `chronicle://${T}`;
export type ChronicleChannel<T extends string = string> = `channel:${T}`;
export type ChronicleTag<T extends string = string> = `tag:${T}`;
export type ChroniclePhase<T extends string = string> = `phase:${T}`;
export type ChronicleMetricLabel<T extends string = string> = `metric.${T}`;
export type ChronicleAxis<T extends string = string> = `axis.${T}`;

export type AxisLabel = ChronicleAxis<
  'throughput' | 'resilience' | 'observability' | 'compliance' | 'cost' | 'operational'
>;

export type ChronicleAxisWeights = { [K in AxisLabel]: number };

export const axisWeights = {
  'axis.throughput': 1,
  'axis.resilience': 1,
  'axis.observability': 0.7,
  'axis.compliance': 0.5,
  'axis.cost': 0.2,
  'axis.operational': 0.8,
} as const satisfies ChronicleAxisWeights;

export type ChroniclePriority = 'p0' | 'p1' | 'p2' | 'p3';
export type ChronicleStatus = 'queued' | 'running' | 'succeeded' | 'degraded' | 'failed' | 'cancelled';
export type PluginDisposition = 'ready' | 'active' | 'skipped' | 'errored';
export type TimelineLane = 'control' | 'signal' | 'policy' | 'telemetry';

export type ChronicleTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head & PropertyKey, ...ChronicleTuple<Tail>]
  : [];

export type InvertTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [...InvertTuple<Tail>, Head & PropertyKey]
    : [];

export type EventName<T extends string> = T & `event:${T}`;
export type EventChannel<T extends string> = ChronicleChannel<T>;
export type TimelineTuple = readonly [ChronicleTag, ChronicleChannel, TimelineLane];

export type ChroniclePath<T extends Record<string, unknown>> = ExpandPluginPath<T>;

export interface ChronicleEntity<TKind extends string, TPayload> {
  readonly kind: TKind;
  readonly id: ChronicleId;
  readonly tenant: ChronicleTenantId;
  readonly createdAt: string;
  readonly payload: TPayload;
}

export interface ChronicleEdge {
  readonly from: ChronicleStepId;
  readonly to: ChronicleStepId;
  readonly weight: number;
}

export interface ChronicleNode {
  readonly id: ChronicleStepId;
  readonly label: string;
  readonly lane: TimelineLane;
  readonly dependencies: readonly ChronicleStepId[];
}

export interface ChroniclePhaseInput<TPayload = unknown> {
  readonly stepId: ChronicleStepId;
  readonly runId: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly phase: ChroniclePhase;
  readonly timeline: TimelineTuple;
  readonly payload: TPayload;
}

export interface ChroniclePhaseOutput<TPayload = unknown> {
  readonly stepId: ChronicleStepId;
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly latencyMs: number;
  readonly score: number;
  readonly payload: TPayload;
}

export interface ChronicleBlueprint {
  readonly name: string;
  readonly description: string;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly tags: readonly ChronicleTag[];
  readonly plan: ChroniclePlanId;
  readonly phases: readonly ChronicleNode[];
  readonly edges: readonly ChronicleEdge[];
}

export interface ChronicleScenario {
  readonly id: ChroniclePlanId;
  readonly title: string;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly priority: ChroniclePriority;
  readonly expectedMaxDurationMs: number;
  readonly axes: ChronicleAxisWeights;
  readonly manifest: ChronicleBlueprint;
}

export interface ChronicleObservation<T = unknown> {
  readonly id: ChronicleId;
  readonly kind: EventName<string>;
  readonly tenant: ChronicleTenantId;
  readonly runId: ChronicleRunId;
  readonly timestamp: number;
  readonly source: ChronicleTag;
  readonly phase: ChroniclePhase;
  readonly route: ChronicleRoute;
  readonly value: T;
}

export interface ChronicleContext<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenant: ChronicleTenantId;
  readonly runId: ChronicleRunId;
  readonly plan: ChroniclePlanId;
  readonly route: ChronicleRoute;
  readonly state: TState;
  readonly priorities: readonly ChroniclePriority[];
  readonly timeline: TimelineTuple;
}

export interface ChronicleSnapshot {
  readonly runId: ChronicleRunId;
  readonly plan: ChroniclePlanId;
  readonly status: ChronicleStatus;
  readonly tenant: ChronicleTenantId;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly observedAt: number;
}

export type ChronologyValue =
  | string
  | number
  | boolean
  | null
  | {
      [K in string]: ChronologyValue;
    }
  | readonly ChronologyValue[];

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

export type RemapReadonly<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `__${string}` ? never : K]: T[K] extends Record<string, unknown>
    ? RemapReadonly<T[K]>
    : T[K];
};

export interface ChroniclePluginDescriptor<TInput = unknown, TOutput = unknown, TState = unknown> {
  readonly id: ChroniclePluginId;
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly ChroniclePhase<string>[];
  readonly state: TState;
  readonly process: (input: ChroniclePhaseInput<TInput>) => Promise<ChroniclePhaseOutput<TOutput>>;
}

export type PluginList<T extends readonly ChroniclePluginDescriptor[]> = {
  readonly [Index in keyof T]: T[Index] extends ChroniclePluginDescriptor<infer TInput, infer TOutput, infer TState>
    ? ChroniclePluginDescriptor<TInput & ChronologyValue, TOutput & ChronologyValue, TState>
    : never;
};

export type PluginOutput<TPlugins extends readonly ChroniclePluginDescriptor[]> = TPlugins extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends ChroniclePluginDescriptor<any, infer TOutput, any>
    ? ChroniclePhaseOutput<TOutput> | PluginOutput<Tail extends readonly ChroniclePluginDescriptor[] ? Tail : never>
    : ChroniclePhaseOutput<unknown>
  : ChroniclePhaseOutput<unknown>;

export type ChroniclePhaseByRoute<TBlueprint extends ChronicleBlueprint, TDefault = unknown> = {
  readonly label: TBlueprint['route'];
  readonly plan: TBlueprint['plan'];
  readonly status: ChronicleStatus;
  readonly metrics: {
    readonly total: number;
    readonly active: number;
  };
  readonly payload?: TDefault;
};

export const asChronicleId = (value: string): ChronicleId => `id:${value}` as ChronicleId;
export const asChronicleTenantId = (value: string): ChronicleTenantId => `tenant:${value}` as ChronicleTenantId;
export const asChroniclePlanId = (tenant: ChronicleTenantId, route: ChronicleRoute): ChroniclePlanId =>
  `${tenant}:${route}` as ChroniclePlanId;
export const asChronicleRunId = (planId: ChroniclePlanId): ChronicleRunId => `${planId}:run:${Date.now()}` as ChronicleRunId;
export const asChroniclePluginId = (value: string): ChroniclePluginId => `plugin:${value}` as ChroniclePluginId;
export const asChronicleStepId = (value: string): ChronicleStepId => `step:${value}` as ChronicleStepId;
export const asChronicleTag = <T extends string>(value: T): ChronicleTag<T> => `tag:${value}` as ChronicleTag<T>;
export const asChronicleChannel = <T extends string>(value: T): ChronicleChannel<T> =>
  `channel:${value}` as ChronicleChannel<T>;
export const asChroniclePhase = <T extends string>(value: T): ChroniclePhase<T> => `phase:${value}` as ChroniclePhase<T>;
export const asChronicleRoute = <T extends string>(value: T): ChronicleRoute<T> => `chronicle://${value}` as ChronicleRoute<T>;

export const collectPriorities = (...priorities: readonly ChroniclePriority[]): readonly ChroniclePriority[] => {
  const seen = new Set<string>();
  return priorities.filter((value): value is ChroniclePriority => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

type TimelineTupleBrand<T extends TimelineTuple> = T extends readonly [infer A, infer B, infer C]
  ? [A & ChronicleTag, B & ChronicleChannel, C & TimelineLane]
  : TimelineTuple;

export const enrichTimeline = <TBlueprint extends ChronicleBlueprint>(
  blueprint: NoInfer<TBlueprint>,
): ChronicleContext<Record<string, unknown>> => {
  const laneHint = blueprint.phases.at(0)?.lane ?? 'control';
  const timeline: TimelineTupleBrand<TimelineTuple> = [
    asChronicleTag('runtime'),
    asChronicleChannel(blueprint.route),
    laneHint,
  ] as TimelineTupleBrand<TimelineTuple>;
  return {
    tenant: blueprint.tenant,
    runId: asChronicleRunId(blueprint.plan),
    plan: blueprint.plan,
    route: blueprint.route,
    state: {
      manifest: blueprint.name,
      manifestPhases: blueprint.phases.length,
      manifestEdges: blueprint.edges.length,
    },
    priorities: collectPriorities('p0', 'p1', 'p2', 'p3'),
    timeline,
  };
};

export const normalize = <T>(value: T): NoInfer<T> => value;

export type AxisMap = {
  readonly throughput: number;
  readonly resilience: number;
  readonly observability: number;
  readonly compliance: number;
  readonly cost: number;
  readonly operational: number;
};

export type ChronologyPathSet<T extends Record<string, unknown>> = {
  readonly [K in RecursivePath<T>]: K;
};

export type FlattenedBlueprint<T extends ChronicleBlueprint> = {
  [K in keyof T as K extends `__${string}` ? never : K]: T[K];
};

export const asReadonlyContext = <T extends Record<string, unknown>>(context: ChronicleContext<T>): ChronicleContext<T> =>
  context;

export interface BlueprintEnvelope<TPayload> {
  readonly scenarioId: ChroniclePlanId;
  readonly tenant: ChronicleTenantId;
  readonly payload: TPayload;
  readonly tags: readonly ChronicleTag[];
}

export type OutputFor<TBlueprint extends ChronicleBlueprint> = DeepReadonlyMap<BlueprintEnvelope<TBlueprint>>;

export const scenarioSchema = z.object({
  id: z.string().optional(),
  tenant: z.string(),
  title: z.string().min(3),
  route: z.string().min(8),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']),
  expectedMaxDurationMs: z.number().nonnegative(),
  tags: z.array(z.string()).default(['tag:seed']),
});

export const validateScenario = (input: unknown): ChronicleScenario | undefined => {
  const parsed = scenarioSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const tenant = asChronicleTenantId(parsed.data.tenant);
  const route = asChronicleRoute(parsed.data.route);
  const id = parsed.data.id ? parsed.data.id : asChroniclePlanId(tenant, route);
  const planId = asChroniclePlanId(tenant, route);
  const plan: ChroniclePlanId = id ? (id as ChroniclePlanId) : planId;
  return {
    id: plan,
    tenant,
    title: parsed.data.title,
    priority: parsed.data.priority,
    expectedMaxDurationMs: parsed.data.expectedMaxDurationMs,
    axes: axisWeights,
    route,
    manifest: {
      name: parsed.data.title,
      description: 'generated scenario manifest',
      tenant,
      route,
      tags: parsed.data.tags.map(asChronicleTag),
      plan,
      phases: [],
      edges: [],
    },
  };
};

export const makeRunId = asChronicleRunId;
export const makeTenantId = asChronicleTenantId;
export const makePlanId = asChroniclePlanId;

export const defaultPlan = (scenario: ChronicleScenario): ChroniclePlanId => scenario.id;
