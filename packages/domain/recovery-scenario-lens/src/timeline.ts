import type {
  Percent,
  ScenarioConstraint,
  SimulationFrame,
  SimulationResult,
  TimelinePoint,
} from './types';
import { asMillis, asPercent } from './types';

export interface TimelineSegment {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly points: readonly TimelinePoint[];
}

export interface TimelineReport {
  readonly scenarioId: string;
  readonly segments: readonly TimelineSegment[];
  readonly completion: Percent;
  readonly peakConcurrency: number;
}

export interface TimelineBucket {
  readonly start: number;
  readonly end: number;
  readonly active: number;
}

export const buildTimeBuckets = (frames: readonly SimulationFrame[], bucketMinutes: number): TimelineBucket[] => {
  if (frames.length === 0 || bucketMinutes <= 0) {
    return [];
  }

  const start = Math.min(...frames.map((frame) => Date.parse(frame.startedAt)));
  const end = Math.max(...frames.map((frame) => Date.parse(frame.finishedAt ?? frame.startedAt)));
  const bucketMs = bucketMinutes * 60 * 1000;
  const buckets: TimelineBucket[] = [];

  for (let cursor = start; cursor < end; cursor += bucketMs) {
    const cursorEnd = cursor + bucketMs;
    const active = frames.filter((frame) => {
      const frameStart = Date.parse(frame.startedAt);
      const frameEnd = Date.parse(frame.finishedAt ?? frame.startedAt);
      return frameStart < cursorEnd && frameEnd > cursor;
    }).length;
    buckets.push({ start: cursor, end: cursorEnd, active });
  }

  return buckets;
};

export const timelineFromResult = (result: SimulationResult): TimelineReport => {
  const buckets = buildTimeBuckets(result.frames, 2);
  const segments = buckets.map((bucket, index) => ({
    from: new Date(bucket.start).toISOString(),
    to: new Date(bucket.end).toISOString(),
    label: `window-${index + 1}`,
    points: result.frames
      .filter((frame) => {
        const start = Date.parse(frame.startedAt);
        const end = Date.parse(frame.finishedAt ?? frame.startedAt);
        return start < bucket.end && end > bucket.start;
      })
      .map((frame) => ({
        timestamp: new Date(Date.parse(frame.startedAt)).toISOString(),
        atMs: asMillis(
          Math.max(
            0,
            Date.parse(frame.startedAt) - Math.min(...result.frames.map((frame) => Date.parse(frame.startedAt))),
          ),
        ),
        value: frame.state === 'completed' ? 1 : frame.state === 'failed' ? -1 : 0,
      })),
  }));

  const completion = segments.length === 0 ? asPercent(0) : asPercent(
    result.frames.filter((frame) => frame.state === 'completed').length / Math.max(result.frames.length, 1),
  );
  const peakConcurrency = buckets.reduce((max, bucket) => Math.max(max, bucket.active), 0);

  return {
    scenarioId: result.scenarioId,
    segments,
    completion,
    peakConcurrency,
  };
};

export const aggregateViolations = (constraints: readonly ScenarioConstraint[]): Readonly<Record<string, number>> => {
  const buckets: Record<string, number> = {};
  for (const constraint of constraints) {
    buckets[constraint.type] = (buckets[constraint.type] ?? 0) + 1;
  }
  return buckets;
};
