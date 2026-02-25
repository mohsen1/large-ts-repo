import { collectIterable, mapIterable, pairwise } from './iterator-utils';
import { withPluginScope } from './lifecycle';
import type { WorkspaceEnvelope, WorkspaceNamespace } from './advanced-lab-core';
import type { PluginNamespace } from './ids';
import { canonicalizeNamespace } from './ids';

export type TimelinePriority = -1 | 0 | 1;
export type TimelineLane = 'signal' | 'state' | 'telemetry' | 'diagnostics';
export type TimelineMode = 'compact' | 'detailed' | 'historical';

export interface TimelineMarker {
  readonly id: string;
  readonly at: number;
  readonly title: string;
  readonly lane: TimelineLane;
  readonly severity: 'info' | 'warn' | 'error' | 'trace';
  readonly priority: TimelinePriority;
}

export interface TimelineWindow<TValue> {
  readonly marker: TimelineMarker;
  readonly value: TValue;
}

export interface TimelineSpan<TValue = unknown> {
  readonly from: TimelineMarker;
  readonly to: TimelineMarker;
  readonly values: readonly TimelineWindow<TValue>[];
}

export type TimelineSequence<TValue = unknown> = readonly TimelineWindow<TValue>[];
export type TimelineBucket<TValue> = [lane: TimelineLane, ...readonly TimelineWindow<TValue>[]];

export interface TimelineEventSummary {
  readonly length: number;
  readonly lanes: readonly TimelineLane[];
  readonly range: [from: number, to: number] | undefined;
}

const baseTimelineMarker = (lane: TimelineLane, key: string, index: number, now = Date.now()): TimelineMarker => ({
  id: `${lane}:${key}:${index}`,
  at: now + index * 9,
  title: `${lane} ${key}`,
  lane,
  severity: lane === 'state' ? 'info' : lane === 'telemetry' ? 'warn' : 'trace',
  priority: lane === 'diagnostics' ? 1 : 0,
});

export const timelineSequenceFromPairs = <T>(pairs: readonly [TimelineLane, T][]): TimelineSequence<T> =>
  pairs.map(([lane, value], index) => ({
    marker: baseTimelineMarker(lane, `item-${index}`, index),
    value,
  }));

export const mergeWindow = <T>(left: TimelineWindow<T>, right: TimelineWindow<T>): TimelineWindow<T> => ({
  marker: {
    ...left.marker,
    title: `${left.marker.title} / ${right.marker.title}`,
    at: Math.min(left.marker.at, right.marker.at),
    severity: right.marker.severity === 'error' ? 'error' : left.marker.severity,
  },
  value: right.value,
});

export const pairTimelineWindows = <T>(
  input: TimelineSequence<T>,
): readonly [TimelineWindow<T>, TimelineWindow<T>][] =>
  collectIterable(pairwise(input)) as readonly [TimelineWindow<T>, TimelineWindow<T>][];

export const filterTimelineByLane = <T>(
  input: TimelineSequence<T>,
  lane: TimelineLane | readonly TimelineLane[],
): TimelineSequence<T> => {
  const lanes = new Set(Array.isArray(lane) ? lane : [lane]);
  return input.filter((entry) => lanes.has(entry.marker.lane));
};

export const splitTimelineByLane = <T>(
  input: TimelineSequence<T>,
  lane: TimelineLane | readonly TimelineLane[],
): TimelineWindow<T>[] => {
  const filtered = filterTimelineByLane(input, lane);
  return [...filtered];
};

export const summarizeTimeline = <T>(sequence: TimelineSequence<T>): TimelineEventSummary => {
  if (sequence.length === 0) {
    return { length: 0, lanes: [], range: undefined };
  }
  const lanes = [...new Set(sequence.map((entry) => entry.marker.lane))];
  const atValues = sequence.map((entry) => entry.marker.at);
  return {
    length: sequence.length,
    lanes,
    range: [Math.min(...atValues), Math.max(...atValues)],
  };
};

export const timelineBuckets = <T>(input: TimelineSequence<T>): readonly TimelineBucket<T>[] => {
  const map: Record<TimelineLane, TimelineWindow<T>[]> = {
    signal: [],
    state: [],
    telemetry: [],
    diagnostics: [],
  };

  for (const item of input) {
    map[item.marker.lane].push(item);
  }
  return Object.entries(map).map(([lane, bucket]) => [lane as TimelineLane, ...bucket] as TimelineBucket<T>);
};

export const timelineSpans = <T>(input: TimelineSequence<T>): readonly TimelineSpan<T>[] =>
  pairTimelineWindows(input).map(([left, right]) => ({ from: left.marker, to: right.marker, values: [left, right] }));

export const timelineWindowById = <T>(input: TimelineSequence<T>, markerId: string): TimelineWindow<T> | undefined =>
  input.find((entry) => entry.marker.id.includes(markerId));

export const toMarkerMatrix = <T>(input: TimelineSequence<T>): string[][] =>
  input.map((entry) => [entry.marker.id, entry.marker.title, String(entry.marker.at), entry.marker.severity]);

export const timelineForEnvelope = async <T>(
  envelope: WorkspaceEnvelope<Record<string, unknown>>,
): Promise<TimelineSequence<T>> => {
  return withPluginScope(
    {
      startedAt: new Date().toISOString(),
      requestId: envelope.runId,
      tenantId: envelope.tenantId,
      namespace: canonicalizeNamespace(envelope.namespace) as PluginNamespace,
    },
    async () => {
      const now = Date.now();
      const lanes = ['signal', 'state', 'telemetry', 'diagnostics'] as const;
      const entries = lanes.flatMap((lane, index) => {
        return Array.from({ length: index + 2 }, (_unused, offset) => ({
          marker: {
            id: `${envelope.runId}-${lane}-${offset}`,
            at: now + index * 101 + offset,
            title: `${lane} event ${offset}`,
            lane,
            severity: offset % 3 === 0 ? ('info' as const) : offset % 3 === 1 ? ('warn' as const) : ('trace' as const),
            priority: 0 as TimelinePriority,
          },
          value: { lane, step: String(offset), namespace: envelope.namespace, mode: index === 0 ? 'compact' : 'detailed' },
        })) as TimelineWindow<T>[];
      });
      return toSortedSequence(entries as TimelineSequence<T>, (left, right) => left.marker.at - right.marker.at);
    },
  );
};

const toSortedSequence = <T>(input: TimelineSequence<T>, comparer: (left: TimelineWindow<T>, right: TimelineWindow<T>) => number) =>
  [...input].toSorted(comparer);

export const materializeTimeline = async <T>(
  tenantId: string,
  envelope: WorkspaceEnvelope<Record<string, unknown>>,
  mode: TimelineMode = 'compact',
): Promise<{ readonly runId: string; readonly sequence: TimelineSequence<T>; readonly laneFingerprint: string }> => {
  const source = await timelineForEnvelope<T>(envelope);
  const selected = mode === 'compact' ? source.filter((entry) => entry.marker.priority <= 0) : source;
  const laneFingerprint = [...new Set(selected.map((entry) => entry.marker.lane))].join('|');
  return { runId: envelope.runId, sequence: selected, laneFingerprint };
};

export const timelineFromEntries = (entries: readonly TimelineWindow<unknown>[]): TimelineSequence<unknown> =>
  toSortedSequence(entries, (left, right) => left.marker.at - right.marker.at);

export const toTimelineLines = <T>(sequence: TimelineSequence<T>): string =>
  sequence
    .map((entry) => `${entry.marker.id}\t${entry.marker.at}\t${entry.marker.lane}\t${entry.marker.title}\t${entry.marker.severity}`)
    .join('\n');

export const timelineFingerprint = <T>(sequence: TimelineSequence<T>): string => {
  const lanes = sequence.map((entry) => entry.marker.lane).join('|');
  return `${sequence.length}::${lanes}`;
};
