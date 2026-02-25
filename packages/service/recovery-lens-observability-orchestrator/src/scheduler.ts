import type { MetricRecord } from '@domain/recovery-lens-observability-models';

export type ScheduledPoint = {
  readonly index: number;
  readonly at: number;
  readonly metric: `metric:${string}`;
};

export const makeSchedule = <TPayload extends Record<string, unknown>>(
  points: readonly MetricRecord<TPayload>[],
): readonly ScheduledPoint[] =>
  points.map((point, index) => ({
    index,
    at: Date.parse(point.timestamp) + index * 30,
    metric: point.metric,
  }));

export const runSchedule = <TPayload extends Record<string, unknown>>(
  points: readonly MetricRecord<TPayload>[],
): readonly MetricRecord<TPayload>[] => {
  const schedule = makeSchedule(points);
  return points
    .map((point, index) => ({
      ...point,
      payload: { ...point.payload, scheduledAt: schedule[index]?.at } as TPayload,
    }))
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
};
