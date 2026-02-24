import type { LatticeSignalEvent, LatticeTimeline, LatticeQuery } from './models';
import type { LatticeStoreRepository } from './store';

export interface TimelineStats {
  readonly streamId: string;
  readonly totalEvents: number;
  readonly buckets: Record<string, number>;
  readonly latestLevel: string;
}

export interface SignalVector {
  readonly streamId: string;
  readonly latest: number;
  readonly average: number;
  readonly levels: readonly string[];
}

export interface SignalEnvelope {
  readonly streamId: string;
  readonly levels: readonly string[];
  readonly trend: readonly number[];
}

export const summarizeTimeline = (timelines: readonly LatticeTimeline[]): TimelineStats => {
  const events = timelines.flatMap((timeline) => timeline.events);
  const buckets = events
    .map((entry) => entry.level)
    .reduce((acc, level) => {
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const latest = events.toSorted((left, right) => right.at.localeCompare(left.at))[0];

  return {
    streamId: events[0]?.streamId ?? 'unknown',
    totalEvents: events.length,
    buckets,
    latestLevel: latest?.level ?? 'none',
  };
};

export const describeSignals = (signals: readonly LatticeSignalEvent[]): SignalVector => {
  const trend = signals.map((signal) => signal.score);
  const levels = [...new Set(signals.map((signal) => signal.level))].toSorted();
  const total = trend.reduce((acc, value) => acc + value, 0);
  return {
    streamId: signals[0]?.streamId ?? 'stream://unknown',
    latest: trend[trend.length - 1] ?? 0,
    average: trend.length ? total / trend.length : 0,
    levels,
  };
};

export const envelopeSignals = (signals: readonly LatticeSignalEvent[]): SignalEnvelope => ({
  streamId: signals[0]?.streamId ?? 'stream://unknown',
  levels: [...new Set(signals.map((signal) => signal.level))].toSorted(),
  trend: signals.map((signal) => signal.score),
});

export const buildSummaryReport = (timeline: readonly LatticeTimeline[]): string => {
  return timeline
    .map((entry) => {
      const summary = summarizeTimeline([entry]);
      return `${entry.streamId}:${summary.totalEvents}:${summary.latestLevel}`;
    })
    .join('; ');
};

export const computeAlertVector = async (
  repository: LatticeStoreRepository,
  query: LatticeQuery,
): Promise<readonly string[]> => {
  const timelines = await repository.queryTimeline(query);
  return timelines
    .map((timeline) => summarizeTimeline([timeline]))
    .flatMap((summary) =>
      Object.entries(summary.buckets)
        .filter(([, value]) => value > 0)
        .map(([level, value]) => `${summary.streamId}:${level}:${value}`),
    );
};
