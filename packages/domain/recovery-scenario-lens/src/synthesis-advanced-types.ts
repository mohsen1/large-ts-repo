import type { Brand, NoInfer } from '@shared/type-level';
import type {
  SynthesisPluginName,
  StageName,
  SynthesisTraceId,
} from '@shared/recovery-synthesis-runtime';

import type { SynthesisWorkspaceEvent, SynthesisRuntimeId } from './synthesis-types';

export type SynthesisTenant = Brand<string, 'SynthesisTenantId'>;
export type SynthesisRunToken = Brand<string, 'SynthesisRunToken'>;
export type SynthesisRoute = `route:${string}`;
export type SynthesisSlot = `slot:${number}`;
export type NormalizedLatency = `${number}ms`;

export type StageKey<T extends StageName = StageName> = `stage:${T & string}`;
export type PluginChannel = `plugin:${SynthesisPluginName & string}`;

export interface SynthesisTraceDescriptor {
  readonly tenant: SynthesisTenant;
  readonly runtime: SynthesisRuntimeId;
  readonly token: SynthesisRunToken;
}

export interface SynthesisPolicyHint<TScope extends string = 'global'> {
  readonly scope: TScope;
  readonly priority: 0 | 1 | 2 | 3 | 4 | 5;
  readonly tags: readonly string[];
  readonly metadata: Record<`cfg:${string}`, string>;
}

type SplitTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...SplitTuple<Tail>]
  : readonly [];

type ConcatTuple<A extends readonly unknown[], B extends readonly unknown[]> = [...A, ...B];

export type PrefixTuple<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [Lowercase<`quantum.${Head}`>, ...PrefixTuple<Tail & readonly string[]>]
    : readonly []
  : readonly [];

export interface SynthesisTraceMetric<TPayload = unknown, TStage extends StageName = StageName> {
  readonly stage: StageKey<TStage>;
  readonly plugin: PluginChannel;
  readonly payload: Readonly<TPayload>;
  readonly at: string;
  readonly latency: NormalizedLatency;
}

export type WorkspaceEventCategory = 'plan' | 'simulate' | 'govern' | 'alert' | 'publish' | 'store';
export type TelemetryDimension = WorkspaceEventCategory;
export type WorkspaceEventByCategory = {
  [K in WorkspaceEventCategory as `evt:${K}`]: K;
};

export interface WorkspaceEventEnvelope<TPayload = unknown, TCategory extends WorkspaceEventCategory = WorkspaceEventCategory> {
  readonly category: WorkspaceEventByCategory[`evt:${TCategory}`];
  readonly run: SynthesisRunToken;
  readonly event: SynthesisWorkspaceEvent<TPayload>;
  readonly routing: SynthesisRoute;
}

export interface TimelineMetric {
  readonly run: SynthesisRunToken;
  readonly route: SynthesisRoute;
  readonly stageCount: number;
  readonly warningCount: number;
  readonly avgLatencyMs: number;
}

export interface SlotAssignment {
  readonly commandId: string;
  readonly slot: SynthesisSlot;
  readonly owner: SynthesisTenant;
}

export interface TimelineSnapshot {
  readonly traceId: SynthesisTraceId;
  readonly events: readonly SynthesisWorkspaceEvent[];
  readonly runs: readonly SynthesisRunToken[];
  readonly route: SynthesisRoute;
}

export type EventTupleUnion<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [{ readonly index: number; readonly value: Head }, ...EventTupleUnion<Tail & readonly unknown[]>]
  : readonly [];

export type InferCommandIds<TConstraint> = TConstraint extends { readonly commandIds: readonly (infer TC)[] }
  ? readonly TC[]
  : readonly [];

export const isTimelineEvent = (value: unknown): value is SynthesisWorkspaceEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    'traceId' in value &&
    'commandId' in value &&
    typeof (value as { commandId: unknown }).commandId === 'string'
  );
};

const isEvent = (value: unknown): value is SynthesisWorkspaceEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'kind' in value && 'when' in value && 'traceId' in value;
};

export const normalizeLatency = (value: number): NormalizedLatency =>
  `${Math.max(0, Math.round(value))}ms` as NormalizedLatency;

export const createTenant = (value: string): SynthesisTenant =>
  `tenant.${value}` as SynthesisTenant;

export const createRunToken = (run: string | number): SynthesisRunToken =>
  `run.${run}` as SynthesisRunToken;

export const describeEventCategory = (event: SynthesisWorkspaceEvent): WorkspaceEventCategory =>
  (event.kind === 'govern' ? 'govern' : event.kind) as WorkspaceEventCategory;

export const routeFromPlugin = (plugin: SynthesisPluginName): SynthesisRoute =>
  `route:${plugin.slice('plugin:'.length)}` as SynthesisRoute;

export const stageToKey = <TStage extends StageName>(stage: NoInfer<TStage>): StageKey<TStage> =>
  `stage:${stage.slice('stage:'.length)}` as StageKey<TStage>;

export const splitSlots = <TSlots extends readonly unknown[]>(
  slots: NoInfer<TSlots>,
): EventTupleUnion<TSlots> => {
  const entries = slots.map((value, index) => ({ index, value }));
  return entries as unknown as EventTupleUnion<TSlots>;
};

export const expandPrefixes = <TLabels extends readonly string[]>(
  labels: NoInfer<TLabels>,
): PrefixTuple<TLabels> => {
  return labels.map((label) => `quantum.${label}`.toLowerCase()) as unknown as PrefixTuple<TLabels>;
};

export const collectByCategory = <TEvents extends readonly SynthesisWorkspaceEvent[]>(
  events: NoInfer<TEvents>,
): {
  readonly [K in WorkspaceEventCategory]: number;
} => {
  const counts: Record<WorkspaceEventCategory, number> = {
    plan: 0,
    simulate: 0,
    govern: 0,
    alert: 0,
    publish: 0,
    store: 0,
  };

  for (const event of events) {
    const category = describeEventCategory(event);
    counts[category] += 1;
  }

  return counts as {
    readonly [K in WorkspaceEventCategory]: number;
  };
};

export const foldSlots = <TSlots extends readonly SlotAssignment[]>(
  slots: NoInfer<TSlots>,
): {
  readonly route: SynthesisRoute;
  readonly runs: readonly SynthesisRunToken[];
  readonly tenant: SynthesisTenant;
} => {
  const runs = slots.map((slot, index) => createRunToken(`${slot.owner}.${slot.slot}.${slot.commandId}-${index}`));
  const latestSlot = slots.at(-1);

  if (!latestSlot) {
    return {
      route: 'route:empty' as SynthesisRoute,
      runs,
      tenant: createTenant('default'),
    };
  }

  return {
    route: routeFromPlugin('plugin:analytics'),
    runs,
    tenant: latestSlot.owner,
  };
};

export const parseTimelineEvents = (events: readonly unknown[]): readonly TimelineMetric[] => {
  const metrics = new Map<SynthesisRunToken, { count: number; latencySum: number; warnings: number; route: SynthesisRoute }>();

  for (const entry of events) {
    if (!isEvent(entry)) {
      continue;
    }

    const run = createRunToken(entry.traceId);
    const state = metrics.get(run) ?? {
      count: 0,
      latencySum: 0,
      warnings: 0,
      route: routeFromPlugin(`plugin:${entry.kind}` as SynthesisPluginName),
    };

    state.count += 1;
    state.latencySum += 17;
    if (entry.payload && typeof entry.payload === 'object') {
      const payload = entry.payload as { warnings?: unknown[] };
      state.warnings += Array.isArray(payload.warnings) ? payload.warnings.length : 0;
    }

    metrics.set(run, state);
  }

  return [...metrics].map(([run, value]) => ({
    run,
    route: value.route,
    stageCount: value.count,
    warningCount: value.warnings,
    avgLatencyMs: value.count === 0 ? 0 : value.latencySum / value.count,
  }));
};

export const mergeTuples = <
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
>(
  left: NoInfer<TLeft>,
  right: NoInfer<TRight>,
): ConcatTuple<TLeft, TRight> => [...left, ...right] as ConcatTuple<TLeft, TRight>;

export const buildSlot = (commandId: string, owner: SynthesisTenant, index: number): SlotAssignment => ({
  commandId,
  slot: `slot:${index}` as SynthesisSlot,
  owner,
});

export const isWellFormedEnvelope = (envelope: WorkspaceEventEnvelope | unknown): envelope is WorkspaceEventEnvelope =>
  !!envelope && typeof envelope === 'object' && 'routing' in envelope && 'run' in envelope && 'event' in envelope && 'category' in envelope;
