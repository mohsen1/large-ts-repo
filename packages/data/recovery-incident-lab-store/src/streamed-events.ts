import {
  type IncidentLabSignal,
  type IncidentLabEnvelope,
  type IncidentLabRun,
  type IncidentLabScenario,
  type IncidentLabPlan,
} from '@domain/recovery-incident-lab-core';
import { collectAsyncIterable } from '@shared/stress-lab-runtime';
import { buildSeries, TimelineSeries, buildSeriesFromEnvelope } from './temporal-series';

export interface EventStreamFrame<TPayload> {
  readonly at: string;
  readonly sequence: number;
  readonly payload: TPayload;
  readonly checksum: string;
}

export interface StreamTelemetry {
  readonly scenario: IncidentLabScenario;
  readonly run: IncidentLabRun;
  readonly series: TimelineSeries;
  readonly checksum: string;
}

interface InternalBucket {
  readonly key: string;
  readonly points: number;
}

export const streamSignals = async function* (
  run: IncidentLabRun,
): AsyncGenerator<EventStreamFrame<IncidentLabSignal>, void, void> {
  const series = buildSeries(run, 1000);
  for (const [index, point] of series.points.entries()) {
    yield {
      at: new Date().toISOString(),
      sequence: index,
      payload: {
        kind: point.kind,
        node: point.kind,
        value: point.value,
        at: point.at,
      },
      checksum: `${run.runId}:${point.kind}:${index}`,
    };
  }
};

export const collectStreamChecksums = async (
  frames: AsyncIterable<EventStreamFrame<IncidentLabSignal>>,
): Promise<ReadonlyMap<string, number>> => {
  const framesList = await collectAsyncIterable(frames);
  const bucketCounts = new Map<string, number>();
  for (const frame of framesList) {
    bucketCounts.set(frame.checksum, (bucketCounts.get(frame.checksum) ?? 0) + 1);
  }
  return bucketCounts;
};

export const consumePlanStream = async (
  scenario: IncidentLabScenario,
  plan: IncidentLabPlan,
): Promise<ReadonlyMap<string, number>> => {
  const envelopes = (scenario.steps || []).map((step, index) => ({
    id: `${scenario.id}:plan:${plan.id}:${index}` as IncidentLabEnvelope['id'],
    labId: scenario.labId,
    scenarioId: scenario.id,
    payload: {
      kind: 'integrity',
      node: step.id,
      value: index + 1,
      at: new Date(Date.now() + index).toISOString(),
    } as IncidentLabSignal,
    createdAt: new Date(Date.now() + index).toISOString(),
    origin: 'streamed-events',
  }));

  const streams = envelopes.map(async function* (envelope) {
    const series = buildSeriesFromEnvelope(envelope, scenario);
    for (const [index, point] of series.points.entries()) {
      yield {
        at: point.at,
        sequence: index,
        payload: {
          kind: point.kind,
          node: point.kind,
          value: point.value,
          at: point.at,
        },
        checksum: `${scenario.id}:${point.at}`,
      };
    }
  });

  const merged = new Map<string, number>();
  for await (const stream of streams) {
    const counts = await collectStreamChecksums(stream);
    for (const [key, count] of counts.entries()) {
      merged.set(key, (merged.get(key) ?? 0) + count);
    }
  }

  return merged;
};
