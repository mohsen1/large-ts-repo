import type { MeshEvent, MeshPlan, MeshExecutionPhase, MeshTenantId, MeshRunId } from '@domain/recovery-cockpit-signal-mesh';
import { mapIterator } from './helpers';
import { summarizeRecord, buildTopologyRecord } from './store';

export type MetricUnit = 'count' | 'ratio' | 'duration' | 'score';
export type MetricBucket = {
  readonly name: string;
  readonly unit: MetricUnit;
  readonly value: number;
  readonly details: Record<string, number>;
};

export type MetricEvent<
  T extends string = string,
  U extends MetricUnit = MetricUnit,
> = { readonly metric: `${string}/${string}`; readonly value: number; readonly labels: readonly string[] };

export type MetricSeries<TLabel extends string = string> = {
  readonly tenant: MeshTenantId;
  readonly runId: MeshRunId;
  readonly labels: readonly TLabel[];
  readonly metrics: readonly MetricEvent<TLabel, MetricUnit>[];
};

const weightedAverage = (left: number, right: number, sample: number): number => (left + right * sample) / (sample + 1);

export const emptySeries = (tenant: MeshTenantId, runId: MeshRunId): MetricSeries => ({
  tenant,
  runId,
  labels: [],
  metrics: [],
});

export const phaseEventCount = (events: readonly MeshEvent[], phase: MeshExecutionPhase): number =>
  events.filter((event) => event.phase === phase).length;

export const eventSeverityHeat = (events: readonly MeshEvent[]): Record<string, number> =>
  events.reduce<Record<string, number>>((acc, event) => {
    const name = event.name;
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

export const computeEventBuckets = (events: readonly MeshEvent[]): readonly MetricEvent[] => {
  const counts = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.phase] = (acc[event.phase] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([phase, value]) => ({
    metric: `events/${phase}`,
    value,
    labels: [phase],
  }));
};

export const computePlanDensity = (plan: MeshPlan): MetricEvent<'topology', 'ratio'> => ({
  metric: 'topology/ratio',
  value: plan.intents.length > 0 ? plan.intents.length / Math.max(plan.steps.length, 1) : 0,
  labels: [plan.id as string],
});

export const aggregate = (plan: MeshPlan, events: readonly MeshEvent[]): readonly MetricBucket[] => {
  const buckets = computeEventBuckets(events);
  const bucketsByName = new Map<string, MetricEvent[]>();
  for (const bucket of buckets) {
    const list = bucketsByName.get(bucket.metric) ?? [];
    list.push(bucket);
    bucketsByName.set(bucket.metric, list);
  }
  return [...bucketsByName.entries()].map(([name, group]) => {
    const values = group.map((item) => item.value);
    const value = values.reduce((acc, current) => acc + current, 0);
    return {
      name,
      unit: name.endsWith('/ratio') ? 'ratio' : 'count',
      value,
      details: {
        count: values.length,
      },
    };
  });
};

export const withRecordSummary = (
  tenant: MeshTenantId,
  runId: MeshRunId,
  events: readonly MeshEvent[],
): MetricSeries<string> => ({
  tenant,
  runId,
  labels: ['signal', 'mesh', 'events'],
  metrics: computeEventBuckets(events),
});

export const rollingMean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((acc, value, index) => weightedAverage(acc, value, index), values[0] ?? 0);

export const normalizeMetric = <T extends MetricUnit>(metric: MetricEvent<string, T>, scale: number): MetricEvent<string, T> => ({
  ...metric,
  value: metric.value / Math.max(scale, 1),
});

export const projectRecords = (records: readonly ReturnType<typeof buildTopologyRecord>[]) =>
  mapIterator(records, (record) => summarizeRecord(record));

export const summarizePlan = (plan: MeshPlan): string =>
  `${plan.id as string} phase=${plan.intents.at(0)?.phase ?? 'unknown'} intents=${plan.intents.length}`;

export const digestTopology = (recordSummaries: readonly string[]): string =>
  `mesh-topologies:${recordSummaries.length}`.concat(
    recordSummaries
      .slice(0, 3)
      .map((summary) => summary)
      .join('|'),
  );
