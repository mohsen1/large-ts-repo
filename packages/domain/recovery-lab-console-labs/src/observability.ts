import { type ControlLabRuntimeEvent, type LabRunOutput, type ControlLabTimeline } from './types';

const toArray = <T>(value: Iterable<T> | AsyncIterable<T>): Promise<readonly T[]> =>
  (async () => {
    const out: T[] = [];
    for await (const item of value) {
      out.push(item);
    }
    return out;
  })();

export interface TimelineWindow {
  readonly id: string;
  readonly startedAt: string;
  readonly summary: string;
}

const eventTimestamp = (payload: unknown): string => {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { at?: unknown };
    if (typeof candidate.at === 'number') {
      return new Date(candidate.at).toISOString();
    }
    if (typeof candidate.at === 'string') {
      return candidate.at;
    }
  }
  return new Date().toISOString();
};

export const summarizeTimeline = async (
  events: Iterable<ControlLabRuntimeEvent> | AsyncIterable<ControlLabRuntimeEvent>,
): Promise<readonly TimelineWindow[]> => {
  const snapshot = await toArray(events);
  return snapshot.map((event, index) => ({
    id: `${event.runId}::${index}`,
    startedAt: eventTimestamp(event.payload),
    summary: `${event.kind}::${event.trace}`,
  }));
};

export interface TimelinePoint {
  readonly runId: string;
  readonly kind: string;
  readonly count: number;
  readonly latestTrace: string;
}

export const buildTimelinePoints = (events: readonly ControlLabRuntimeEvent[]): readonly TimelinePoint[] =>
  events.map((event) => ({
    runId: event.runId,
    kind: event.kind,
    count: event.trace.length,
    latestTrace: event.trace,
  }));

export const dedupeTimeline = (points: readonly TimelinePoint[]): readonly TimelinePoint[] => {
  const map = new Map<string, TimelinePoint>();
  for (const point of points) {
    const existing = map.get(point.kind);
    if (!existing) {
      map.set(point.kind, point);
      continue;
    }
    map.set(point.kind, {
      ...existing,
      count: existing.count + point.count,
      latestTrace: `${existing.latestTrace};${point.latestTrace}`,
    });
  }
  return [...map.values()];
};

export const timelineReport = <TOutput>(run: Omit<LabRunOutput<TOutput>, 'output'>): string =>
  [
    `run=${run.runId}`,
    `duration=${run.elapsedMs}`,
    `stages=${run.timeline.stages.join(',')}`,
    `events=${run.timeline.events.length}`,
    `diagnostics=${run.timeline.diagnostics.length}`,
  ].join('|');

export const timelineByKind = (timeline: ControlLabTimeline): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const event of timeline.events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
};
