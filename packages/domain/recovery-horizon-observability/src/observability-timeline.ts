import type { JsonLike, PluginStage } from '@domain/recovery-horizon-engine';
import type { ObservatoryStage, ObservatorySignalRecord, ObservatoryWindowId, ObservatoryTenant } from './observability-identity';

export interface TimelineNode<TStage extends ObservatoryStage = ObservatoryStage> {
  readonly id: ObservatoryWindowId;
  readonly stage: TStage;
  readonly durationMs: number;
  readonly errorCount: number;
  readonly metadata: Record<string, JsonLike>;
}

export interface TimelineEdge {
  readonly from: ObservatoryWindowId;
  readonly to: ObservatoryWindowId;
  readonly weight: number;
}

export interface ObservabilityTimeline<T extends readonly ObservatoryStage[] = readonly ObservatoryStage[]> {
  readonly tenantId: ObservatoryTenant;
  readonly stages: T;
  readonly nodes: readonly TimelineNode<T[number]>[];
  readonly edges: readonly TimelineEdge[];
  readonly stamps: readonly number[];
  readonly ordered: ReadonlyArray<T[number]>;
}

type TailTuple<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];
type HeadTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...unknown[]] ? Head : never;

type ShiftedTimeline<T extends readonly ObservatoryStage[]> = T extends readonly [infer H, ...infer R]
  ? readonly [HeadTuple<T>, ...ShiftedTimeline<R & readonly ObservatoryStage[]>]
  : [];

export type TimelinePairs<T extends readonly ObservatoryStage[]> = T extends readonly [infer Left, ...infer Right]
  ? Right extends readonly ObservatoryStage[]
    ? Right extends []
      ? []
      : readonly [
          [Left & ObservatoryStage, Right[0]],
          ...TimelinePairs<Right>,
        ]
    : []
  : [];

const stageWeight = (stage: PluginStage): number => {
  if (stage === 'ingest') {
    return 1;
  }
  if (stage === 'analyze') {
    return 2;
  }
  if (stage === 'resolve') {
    return 3;
  }
  if (stage === 'optimize') {
    return 4;
  }
  return 5;
};

const createNode = (signal: ObservatorySignalRecord): TimelineNode => {
  const payloadValue = signal.payload;
  const payload = typeof payloadValue === 'object' && payloadValue !== null && !Array.isArray(payloadValue)
    ? payloadValue as Record<string, JsonLike>
    : {};
  return {
    id: signal.manifest.windowId,
    stage: signal.stage,
    durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : Number(payload.durationMs ?? 0),
    errorCount: typeof payload.errorCount === 'number' ? payload.errorCount : 0,
    metadata: payload,
  };
};

const createEdge = (from: TimelineNode, to: TimelineNode): TimelineEdge => ({
  from: from.id,
  to: to.id,
  weight: Math.abs(to.durationMs - from.durationMs) + stageWeight(to.stage),
});

export const foldTimeline = <TStages extends readonly ObservatoryStage[]>(
  tenantId: ObservatoryTenant,
  signals: readonly ObservatorySignalRecord[],
): ObservabilityTimeline<TStages> => {
  const nodes = signals
    .map((signal) => createNode(signal))
    .filter((node) => node.durationMs >= 0)
    .slice(0, 128) as TimelineNode<TStages[number]>[];

  const edges: TimelineEdge[] = [];
  const ordered = [...nodes.map((node) => node.stage)] as unknown as TStages;
  const stamps = nodes.map((node) => Date.now() - node.durationMs);
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createEdge(nodes[index], nodes[index + 1]));
  }

  return {
    tenantId,
    stages: ordered,
    nodes: nodes.slice(0, 16),
    edges: edges.slice(0, 16),
    stamps,
    ordered: ordered.slice().reverse(),
  };
};

export const buildTimelinePairs = <T extends readonly ObservatoryStage[]>(
  stages: T,
): TimelinePairs<T> => {
  const pairs = [] as Array<[ObservatoryStage, ObservatoryStage]>;
  for (let index = 0; index < stages.length - 1; index += 1) {
    const current = stages[index];
    const next = stages[index + 1];
    if (current && next) {
      pairs.push([current, next]);
    }
  }
  return pairs as TimelinePairs<T>;
};

export const zipStageSignalPairs = <T extends readonly ObservatorySignalRecord[]>(
  signals: T,
): readonly [ObservatorySignalRecord, ObservatorySignalRecord][] => {
  const pairs: [ObservatorySignalRecord, ObservatorySignalRecord][] = [];
  for (let index = 0; index < signals.length - 1; index += 1) {
    const head = signals[index];
    const tail = signals[index + 1];
    if (head && tail) {
      pairs.push([head, tail]);
    }
  }
  return pairs;
};

export const shiftTimeline = <T extends readonly ObservatoryStage[]>(stages: T): ShiftedTimeline<T> =>
  (stages.length > 1 ? (stages.slice(1) as ShiftedTimeline<T>) : ([] as ShiftedTimeline<T>));
