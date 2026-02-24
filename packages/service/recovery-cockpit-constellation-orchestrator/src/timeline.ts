import { toPercent } from '@shared/util';
import type { NoInfer } from '@shared/type-level';
import type { ConstellationEvent } from '@domain/recovery-cockpit-constellation-core';
import type { ConstellationRunSnapshot } from '@data/recovery-cockpit-constellation-store';

export type TimelineSample = {
  readonly at: string;
  readonly count: number;
};

export type TimelineCategory = [string, number];

export interface TimelineSeries {
  readonly planId: string;
  readonly runId: string;
  readonly samples: readonly TimelineSample[];
  readonly categories: readonly TimelineCategory[];
}

type TimelinePoint = {
  readonly at: string;
  readonly value: number;
};

const byTimestamp = (left: TimelineSample, right: TimelineSample): number =>
  left.at.localeCompare(right.at);

const eventLabel = (entry: ConstellationRunSnapshot['audit'][number]) =>
  `${entry.action}:${entry.at}:${entry.correlationId}`;

const eventBuckets = (events: readonly ConstellationEvent[]): Readonly<Record<string, number>> =>
  events.reduce<Record<string, number>>((acc, event) => {
    const key = `${event.kind}:${event.tags.join(':')}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

export const buildTimelineSeries = (snapshot: ConstellationRunSnapshot): TimelineSeries => {
  const samples = snapshot.audit
    .map((entry) => ({ at: entry.at, count: eventLabel(entry).length }))
    .toSorted(byTimestamp);

  const grouped = snapshot.audit.reduce<Record<string, number>>((acc, item) => ({
    ...acc,
    [item.action]: (acc[item.action] ?? 0) + 1,
  }), {});

  return {
    planId: snapshot.planId,
    runId: snapshot.runId,
    samples,
    categories: Object.entries(grouped),
  };
};

const categorySamples = (events: readonly ConstellationEvent[]): readonly TimelineCategory[] => Object.entries(eventBuckets(events));

const normalizeSamples = (points: readonly TimelinePoint[]): readonly TimelineSample[] =>
  points.map((point) => ({ at: point.at, count: point.value }));

export const collectTimeline = <T extends { audit: readonly ConstellationEvent[] }>(
  snapshots: NoInfer<readonly T[]>,
): readonly TimelineSample[] => {
  const byRun = snapshots
    .flatMap((snapshot) =>
      snapshot.audit.map((event, index) => ({ at: event.timestamp ?? event.kind, count: index + 1 })),
    )
    .toSorted((left, right) => left.at.localeCompare(right.at));
  return byRun;
};

export const normalizeTimeline = (events: readonly ConstellationEvent[]): TimelineSeries => {
  const samples = normalizeSamples(
    events.map((event, index) => ({
      at: event.timestamp,
      value: event.message.length + index,
    })),
  );
  return {
    planId: 'timeline',
    runId: 'timeline',
    samples: samples.toSorted((left, right) => left.at.localeCompare(right.at)),
    categories: categorySamples(events),
  };
};

export const mapTimelineDensity = (samples: readonly TimelineSample[]): number => {
  if (samples.length === 0) return 0;
  const first = Number(new Date(samples[0]?.at));
  const last = Number(new Date(samples[samples.length - 1]?.at));
  const duration = Math.max(1, last - first);
  const total = samples.reduce((acc, sample) => acc + sample.count, 0);
  return toPercent(total, duration / 1000);
};
