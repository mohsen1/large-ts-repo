import {
  asChroniclePlanId,
  asChronicleRoute,
  asChronicleRunId,
  asChronicleScope,
  asChronicleTenantId,
  asChronicleTag,
  buildChronicleScope,
  type ChronicleEventKind,
  type ChronicleMetricAxis,
  type ChroniclePhase,
  type ChroniclePluginCatalog,
  type ChroniclePluginDescriptor,
  type ChronicleRoute,
  type ChronicleRunId,
  type ChroniclePlanId,
  type ChronicleStatus,
  type ChronicleTenantId,
  type EventMap,
  type TopologyGraph,
} from '@shared/chronicle-orchestration-protocol';
import { toMetricKey } from '@shared/chronicle-orchestration-protocol';
import type { DeepPartial, PageResult } from '@shared/core';
import type { RecursivePath } from '@shared/type-level';
import { normalizeLimit } from '@shared/core';

export type BlueprintPhase = Extract<ChroniclePhase, `phase:${ChronicleEventKind}`>;
export type SessionAxis = ChronicleMetricAxis | `axis:${string}`;

export interface BlueprintTemplate<TPhases extends readonly BlueprintPhase[] = readonly BlueprintPhase[]> {
  readonly tenant: string;
  readonly route: string;
  readonly phases: TPhases;
  readonly budgetMs: number;
  readonly tags: readonly string[];
}

export interface Blueprint<TPhases extends readonly BlueprintPhase[] = readonly BlueprintPhase[]> {
  readonly id: ChroniclePlanId;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly planId: ChroniclePlanId;
  readonly phases: TPhases;
  readonly createdAt: number;
  readonly label: string;
  readonly tags: readonly string[];
  readonly budgetMs: number;
}

export interface SessionContext {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly runId: ChronicleRunId;
  readonly planId: ChroniclePlanId;
  readonly phaseIndex: number;
  readonly startedAt: number;
}

export interface RunGoal {
  readonly kind: 'reduce-rto' | 'maximize-coverage' | 'stabilize-failover';
  readonly target: number;
}

export type GoalFor<T extends RunGoal['kind']> = Extract<RunGoal, { kind: T }>;

export interface RunEnvelope<TPayload = unknown> {
  readonly id: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly payload: DeepPartial<TPayload>;
  readonly createdAt: number;
  readonly goal: RunGoal;
}

export interface RunEvent {
  readonly runId: ChronicleRunId;
  readonly phase: BlueprintPhase;
  readonly status: ChronicleStatus;
  readonly details: string;
  readonly at: number;
}

export type LabEvent = RunEvent;

export interface SimulationInput {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly limit?: number;
  readonly goal: RunGoal;
}

export interface SimulationOutput {
  readonly runId: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly events: readonly RunEvent[];
  readonly metrics: Readonly<EventMap<{ score: number; latency: number; stability: number }>>;
  readonly status: ChronicleStatus;
  readonly graph: TopologyGraph;
}

export interface SessionStatus {
  readonly runId: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly status: ChronicleStatus;
  readonly score: number;
  readonly route: ChronicleRoute;
  readonly phases: readonly BlueprintPhase[];
}

export interface SessionMetrics {
  readonly runId: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<SessionAxis, number>>;
}

export interface PluginBundle {
  readonly byPhase: Partial<Record<BlueprintPhase, ChroniclePluginDescriptor>>;
  readonly plugins: readonly ChroniclePluginDescriptor[];
}

export type PluginBundleByPhase<T extends ChroniclePluginCatalog> = {
  [K in keyof T as T[K] extends { readonly supports: readonly BlueprintPhase[] } ? K : never]: T[K];
};

export interface PlannerInput {
  readonly tenant: string;
  readonly route: string;
  readonly phases: readonly BlueprintPhase[];
  readonly plugins: readonly ChroniclePluginDescriptor[];
  readonly limit?: number;
  readonly goal: RunGoal;
}

export interface PlannerOutput {
  readonly blueprint: Blueprint;
  readonly plugins: PluginBundle;
  readonly context: SessionContext;
}

export interface PlannerState {
  readonly activeBlueprint?: Blueprint;
  readonly queue: readonly string[];
  readonly warnings: readonly string[];
}

export interface PluginFilter<T extends readonly ChroniclePluginDescriptor[]> {
  readonly phase: BlueprintPhase;
  readonly plugins: T;
}

export type PlannerResult<T extends readonly BlueprintPhase[]> = {
  readonly blueprint: Blueprint<T>;
  readonly orderedPhases: T;
  readonly plugins: PluginBundle;
};

export interface InsightRecord {
  readonly route: ChronicleRoute;
  readonly tenant: ChronicleTenantId;
  readonly values: readonly {
    axis: SessionAxis;
    score: number;
    trend: 'up' | 'down' | 'flat';
  }[];
}

export type MetricPath<T> = Exclude<RecursivePath<T>, number>;

export interface MetricQuery {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly phase: BlueprintPhase;
  readonly path: MetricPath<{ telemetry: { score: number; latency: number } }>;
}

export type EventSequence<T extends ReadonlyArray<unknown>> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...EventSequence<Tail>]
  : [];

export const makeBlueprint = <TPhases extends readonly BlueprintPhase[]>(template: BlueprintTemplate<TPhases>): Blueprint<TPhases> => {
  const tenantId = asChronicleTenantId(template.tenant);
  const route = asChronicleRoute(template.route);
  const createdAt = Date.now();
  const planId = asChroniclePlanId(tenantId, route);
  return {
    id: planId,
    tenant: tenantId,
    route,
    planId,
    phases: template.phases,
    createdAt,
    label: `${tenantId}/${route}`,
    tags: template.tags.map((tag) => String(asChronicleTag(tag))),
    budgetMs: normalizeLimit(template.budgetMs),
  };
};

export const initialContext = (tenant: string, route: string): SessionContext => {
  const tenantId = asChronicleTenantId(tenant);
  const routeId = asChronicleRoute(route);
  const runId = asChronicleRunId(tenantId, routeId);
  return {
    tenant: tenantId,
    route: routeId,
    runId,
    planId: asChroniclePlanId(tenantId, routeId),
    phaseIndex: 0,
    startedAt: Date.now(),
  };
};

export const normalizeGoal = (goal: RunGoal): RunGoal => ({
  ...goal,
  target: normalizeLimit(goal.target),
});

export const normalizePhases = (phases: readonly BlueprintPhase[]): readonly BlueprintPhase[] =>
  [...new Set(phases)].toSorted((left, right) => left.localeCompare(right));

export const splitScopes = <T extends readonly string[]>(value: T): T =>
  value.map((entry) => buildChronicleScope(entry) as unknown as string) as unknown as T;

export const isTerminalStatus = (status: ChronicleStatus): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'degraded';

export const buildSessionStatus = (output: SimulationOutput): SessionStatus => {
  const events = output.events;
  return {
    runId: output.runId,
    tenant: output.tenant,
    status: output.status,
    score: output.metrics[toMetricKey('score') as keyof typeof output.metrics],
    route: output.graph.route,
    phases: events.map((event) => event.phase),
  };
};

export const estimateScore = (metric: number, index: number): number => {
  const normalized = Math.max(0, Math.min(100, metric));
  return normalized + index * 0.25;
};

export const pagePlanMetrics = (records: readonly InsightRecord[], pageSize: number): ReadonlyArray<Readonly<{ at: number; records: readonly InsightRecord[] }>> => {
  const normalized = normalizeLimit(pageSize);
  const buckets = Array.from({
    length: Math.max(1, Math.ceil(records.length / normalized)),
  }).keys();
  const pages: Array<{ at: number; records: readonly InsightRecord[] }> = [];
  for (const bucket of buckets) {
    const start = bucket * normalized;
    pages.push({
      at: start,
      records: records.slice(start, start + normalized),
    });
  }
  return pages as ReadonlyArray<Readonly<{ at: number; records: readonly InsightRecord[] }>>;
};

export const mapMetricPage = <T>(items: readonly T[], page: PageResult<T>): readonly T[] =>
  page.items.map((item, index) => item ?? items[index]).filter((item): item is T => item !== undefined);
