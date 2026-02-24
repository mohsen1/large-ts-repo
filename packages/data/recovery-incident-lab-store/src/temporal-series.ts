import type { IncidentLabRun, IncidentLabSignal, IncidentLabEnvelope } from '@domain/recovery-incident-lab-core';
import { createClock, type IncidentLabScenario } from '@domain/recovery-incident-lab-core';
import { collectIterable, mapIterable, zipLongest } from '@shared/stress-lab-runtime';

export interface TimelinePoint {
  readonly at: string;
  readonly value: number;
  readonly kind: IncidentLabSignal['kind'];
}

export interface TimelineBucket {
  readonly from: string;
  readonly to: string;
  readonly points: readonly TimelinePoint[];
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface TimelineSeries {
  readonly points: readonly TimelinePoint[];
  readonly bucketSizeMs: number;
  readonly buckets: readonly TimelineBucket[];
  readonly updatedAt: string;
}

type RecursiveBucket<T extends readonly TimelinePoint[]> = T extends readonly [infer Head extends TimelinePoint, ...infer Tail extends readonly TimelinePoint[]]
  ? [Head, ...RecursiveBucket<Tail>]
  : readonly [];

export const buildTimelinePoints = (run: IncidentLabRun): readonly TimelinePoint[] => {
  const points = run.results.flatMap((result, index) =>
    result.sideEffects.map((sideEffect, effectIndex) => ({
      at: result.startAt,
      value: index + effectIndex,
      kind: (index % 2 === 0 ? 'capacity' : 'latency') as IncidentLabSignal['kind'],
    })),
  );

  return points
    .toSorted((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
    .map((point) => ({
      ...point,
      kind: point.kind,
    }));
};

const bucketStats = (points: readonly TimelinePoint[]): Omit<TimelineBucket, 'from' | 'to'> => {
  const values = points.map((point) => point.value);
  const min = values.length === 0 ? 0 : Math.min(...values);
  const max = values.length === 0 ? 0 : Math.max(...values);
  const mean = values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
  return { points, min, max, mean };
};

export const buildBuckets = (points: readonly TimelinePoint[], bucketMs: number): readonly TimelineBucket[] => {
  const sorted = [...points].toSorted((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  if (sorted.length === 0) {
    return [];
  }

  const base = new Date(sorted[0].at).getTime();
  const buckets = new Map<number, TimelinePoint[]>();

  for (const point of sorted) {
    const index = Math.floor((new Date(point.at).getTime() - base) / bucketMs);
    const current = buckets.get(index) ?? [];
    buckets.set(index, [...current, point]);
  }

  return [...buckets.entries()].map(([index, bucketPoints]) => {
    const stats = bucketStats(bucketPoints);
    return {
      from: new Date(base + index * bucketMs).toISOString(),
      to: new Date(base + (index + 1) * bucketMs).toISOString(),
      points: stats.points,
      mean: stats.mean,
      min: stats.min,
      max: stats.max,
    };
  });
};

export const buildSeries = (run: IncidentLabRun, bucketMs: number): TimelineSeries => {
  const points = buildTimelinePoints(run);
  return {
    points,
    bucketSizeMs: bucketMs,
    buckets: buildBuckets(points, Math.max(1, bucketMs)),
    updatedAt: createClock().now(),
  };
};

export const normalizeSeriesPoints = (series: TimelineSeries): readonly TimelinePoint[] => {
  const normalized = collectIterable(
    mapIterable(series.points, (point, index) => ({
      ...point,
      value: Number((point.value / Math.max(1, series.points.length)).toFixed(3)),
      at: new Date(new Date(point.at).getTime() + index).toISOString(),
    })),
  );
  return normalized;
};

export const mergeSeries = (left: TimelineSeries, right: TimelineSeries): TimelineSeries => {
  const mergedPoints = collectIterable(mapIterable(zipLongest(left.points, right.points), ([leftPoint, rightPoint], index) => {
    if (!leftPoint) {
      return rightPoint as TimelinePoint;
    }
    if (!rightPoint) {
      return leftPoint as TimelinePoint;
    }
    return {
      at: leftPoint.at,
      kind: leftPoint.kind,
      value: (Number(leftPoint.value) + Number(rightPoint.value)) / 2,
    };
  }));

  const buckets = buildBuckets(mergedPoints, Math.max(left.bucketSizeMs, right.bucketSizeMs));
  return {
    points: mergedPoints,
    bucketSizeMs: Math.max(left.bucketSizeMs, right.bucketSizeMs),
    buckets,
    updatedAt: createClock().now(),
  };
};

export const buildSeriesFromEnvelope = (envelope: IncidentLabEnvelope, scenario: IncidentLabScenario): TimelineSeries => {
  const signalKind = (scenario.labels.includes('stress') ? 'capacity' : 'dependency') as IncidentLabSignal['kind'];
  const syntheticRun = {
    runId: `${envelope.id}` as IncidentLabRun['runId'],
    planId: `${scenario.id}:plan` as unknown as IncidentLabRun['planId'],
    scenarioId: scenario.id,
    startedAt: envelope.createdAt,
    state: 'active',
    results: envelope.payload
      ? (Array.isArray((envelope.payload as TimelineSeries).points)
          ? (envelope.payload as TimelineSeries).points.map((point: TimelinePoint, index: number) => ({
              stepId: `step:${index}` as IncidentLabRun['results'][number]['stepId'],
              startAt: point.at,
              finishAt: point.at,
              status: index % 2 === 0 ? 'done' : 'skipped',
              logs: [String(point.value)],
              sideEffects: [signalKind],
            }))
          : [])
      : [],
  } as IncidentLabRun;

  return buildSeries(syntheticRun, 250);
};
