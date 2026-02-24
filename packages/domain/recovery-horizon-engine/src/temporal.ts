import type {
  PluginStage,
  HorizonPlan,
  HorizonSignal,
  TimeMs,
  JsonLike,
  StageLabel,
} from './types.js';
import { horizonBrand, type StageLabel as DomainStageLabel } from './types.js';
import { stagePath } from './orchestration.js';

export type TemporalNode<TKind extends PluginStage = PluginStage, TPayload = JsonLike> = {
  readonly kind: TKind;
  readonly timestamp: TimeMs;
  readonly index: number;
  readonly window: `${TKind}:${number}`;
  readonly payload: TPayload;
};

export type TimelineRecord<TKind extends PluginStage, TPayload> = {
  readonly kind: TKind;
  readonly startedAt: TimeMs;
  readonly window: `${TKind}:${number}`;
};

export type TemporalWindow<T extends readonly HorizonSignal<PluginStage, JsonLike>[]> = {
  readonly [K in T[number] as K['kind']]: ReadonlyArray<K>;
};

export interface TemporalCursor {
  readonly planId: string;
  readonly nodes: readonly TemporalNode[];
  readonly offset: number;
}

export const createTimelineNodes = <
  const T extends readonly HorizonSignal<PluginStage, JsonLike>[],
>(
  planId: string,
  signals: T,
): TemporalCursor => {
  const ordered = [...signals].sort((left, right) => Number(new Date(right.startedAt)) - Number(new Date(left.startedAt)));
  const timeline: TemporalNode[] = ordered.map((signal, index) => ({
    kind: signal.kind,
    timestamp: horizonBrand.fromTime(Date.now() + index) as TimeMs,
    index,
    window: `${signal.kind}:${index}` as const,
    payload: signal.payload,
  }));

  return {
    planId,
    nodes: timeline,
    offset: timeline.length,
  };
};

export const mergeTemporalCursors = (left: TemporalCursor, right: TemporalCursor): TemporalCursor => {
  const nodes = [...left.nodes, ...right.nodes].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  return {
    planId: left.planId,
    nodes,
    offset: nodes.length,
  };
};

export const toPathFromNode = (node: TemporalNode): string => stagePath([node.kind, `@${node.timestamp}`] as const);

export const isChronological = (left: TemporalCursor, right: TemporalCursor): boolean =>
  left.nodes.every((leftNode, index) => {
    const rightNode = right.nodes[index];
    return !rightNode || leftNode.timestamp <= rightNode.timestamp;
  });

export const walkTemporalNode = async function* (cursor: TemporalCursor): AsyncGenerator<TemporalNode> {
  const nodes = [...cursor.nodes].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  for (const node of nodes) {
    await Promise.resolve();
    yield node;
  }
};

export const timelineToPlan = (planId: string, cursor: TemporalCursor): HorizonPlan => {
  const head = cursor.nodes[0]?.kind ?? 'ingest';
  return {
    id: horizonBrand.fromPlanId(planId),
    tenantId: 'tenant-001',
    startedAt: (cursor.nodes[0]?.timestamp ?? horizonBrand.fromTime(Date.now())),
    pluginSpan: {
      stage: head,
      label: `${head.toUpperCase()}_STAGE` as StageLabel<PluginStage>,
      startedAt: horizonBrand.fromTime(Date.now()),
      durationMs: horizonBrand.fromTime(0),
    },
    payload: {
      window: cursor.nodes.map((entry) => entry.kind),
      merged: cursor.offset,
    },
  };
};

export const planFromSignals = (
  planId: string,
  runId: string,
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
) => {
  const cursor = createTimelineNodes(planId, signals);
  return {
    planId,
    runId,
    cursor,
    stages: cursor.nodes.map((entry) => entry.kind as PluginStage),
    signalCount: signals.length,
  } satisfies {
    readonly planId: string;
    readonly runId: string;
    readonly cursor: TemporalCursor;
    readonly stages: readonly PluginStage[];
    readonly signalCount: number;
  };
};

export type TimelineNode<TKind extends PluginStage = PluginStage, TPayload = JsonLike> = TemporalNode<TKind, TPayload>;
export const toTimelineNodes = <
  const TKind extends PluginStage = PluginStage,
  TPayload = JsonLike,
>(
  runId: string,
  signals: readonly HorizonSignal<TKind, TPayload>[],
): TemporalCursor => createTimelineNodes(runId, signals as readonly HorizonSignal<PluginStage, JsonLike>[]);

export { stagePath };

export const toStageLabel = <T extends PluginStage>(stage: T): DomainStageLabel<T> =>
  (`${stage.toUpperCase()}_STAGE` as DomainStageLabel<T>);
