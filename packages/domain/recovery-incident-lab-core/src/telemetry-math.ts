import { createClock } from './types';
import {
  type IncidentLabSignal,
  type IncidentLabRun,
  type IncidentLabEnvelope,
  type IncidentLabScenario,
  type IncidentLabPlan,
  type IncidentLabRun as IncidentLabRunAlias,
} from './types';
import { collectIterable, reduceAsyncIterable, mapIterable, chunkIterable } from '@shared/stress-lab-runtime';

export const quantileBands = [0, 0.25, 0.5, 0.75, 0.95] as const;
export type QuantileBand = (typeof quantileBands)[number];

export type OrderedSignal<TSignal extends IncidentLabSignal = IncidentLabSignal> = Readonly<TSignal> & {
  readonly index: number;
};

export type BucketedSignals<TSignals extends readonly IncidentLabSignal[]> = {
  [TIndex in keyof TSignals as TIndex extends `${number}`
    ? `bucket:${TIndex & number}`
    : never]: TSignals[TIndex] extends IncidentLabSignal ? readonly TSignals[TIndex][] : never;
};

export type TimelineSignature<TSignal extends string> = `${TSignal}-timeline`;

export type SignalWindow<T extends readonly IncidentLabSignal[]> = T extends readonly [infer Head extends IncidentLabSignal, ...infer Tail extends readonly IncidentLabSignal[]]
  ? readonly [OrderedSignal<Head>, ...SignalWindow<Tail>]
  : readonly [];

export const sortSignals = (signals: readonly IncidentLabSignal[]): readonly IncidentLabSignal[] =>
  [...signals].sort((left, right) => left.value - right.value).toSorted();

export const buildSignalVector = (signals: readonly IncidentLabSignal[]): ReadonlyMap<IncidentLabSignal['kind'], number> => {
  const matrix = new Map<IncidentLabSignal['kind'], number[]>();
  for (const signal of signals) {
    matrix.set(signal.kind, [...(matrix.get(signal.kind) ?? []), signal.value]);
  }

  return new Map(
    [...matrix.entries()].map(([kind, values]) => [kind, values.reduce((acc, next) => acc + next, 0) / Math.max(1, values.length)]),
  );
};

const percentile = (values: readonly number[], rawBand: QuantileBand): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((rawBand * (sorted.length - 1)) / 1);
  return sorted[index] ?? sorted[0] ?? 0;
};

export interface SignalVarianceProfile {
  readonly at: string;
  readonly signature: TimelineSignature<string>;
  readonly bands: Readonly<Record<string, number>>;
  readonly sampleCount: number;
}

export const profileSignals = (signals: readonly IncidentLabSignal[]): SignalVarianceProfile => {
  const grouped = new Map<IncidentLabSignal['kind'], number[]>();
  for (const signal of signals) {
    grouped.set(signal.kind, [...(grouped.get(signal.kind) ?? []), signal.value]);
  }

  const bands = Object.fromEntries(
    [...grouped.entries()].map(([kind, values]) => [
      kind,
      quantileBands.reduce<number>(
        (acc, band) => acc + Number(percentile(values, band).toFixed(4)) / quantileBands.length,
        0,
      ),
    ]),
  );

  return {
    at: createClock().now(),
    signature: `${signals.length}-timeline`,
    bands,
    sampleCount: signals.length,
  };
};

export const windowSignals = (
  signals: readonly IncidentLabSignal[],
  bucketSize: number,
): readonly SignalVarianceProfile[] => {
  const chunks = [...chunkIterable(signals, Math.max(1, bucketSize))];
  return chunks.map((chunk) => profileSignals(chunk as IncidentLabSignal[]));
};

export const emitRunTelemetry = async function* (
  scenario: IncidentLabScenario,
  plan: IncidentLabPlan,
  run: IncidentLabRun,
): AsyncGenerator<IncidentLabEnvelope, void, void> {
  const baseAt = createClock();
  const windows = windowSignals(
    run.results.flatMap((entry) =>
      entry.sideEffects.map((sideEffect) => ({
        kind: 'capacity',
        node: String(entry.stepId),
        value: Math.max(0, entry.status === 'failed' ? 2 : 1),
        at: entry.startAt,
      })),
    ),
    3,
  );

  const sortedWindows = windows.toSorted((left, right) => left.sampleCount - right.sampleCount);

  for (const [entryIndex, profile] of sortedWindows.entries()) {
    const id = `${scenario.id}:telemetry:${plan.id}:${entryIndex}` as IncidentLabEnvelope['id'];
    const envelope: IncidentLabEnvelope<SignalVarianceProfile> = {
      id,
      labId: scenario.labId,
      scenarioId: scenario.id,
      payload: profile,
      createdAt: `${baseAt.now()}#${entryIndex}`,
      origin: 'telemetry-math',
    };
    yield envelope;
  }
};

const reduceSignalProfile = async (signals: AsyncIterable<IncidentLabSignal>): Promise<SignalVarianceProfile> => {
  const profile = await reduceAsyncIterable(
    signals,
    [] as IncidentLabSignal[],
    async (acc, item) => [...acc, item],
  );
  return profileSignals(profile);
};

export const buildProfileFromRun = async (run: IncidentLabRunAlias): Promise<SignalVarianceProfile> => {
  const signals: AsyncGenerator<IncidentLabSignal> = async function* () {
    for (const result of run.results) {
      for (let index = 0; index < result.sideEffects.length; index++) {
        yield {
          kind: 'dependency',
          node: `${run.runId}:${index}`,
          value: index + result.sideEffects.length,
          at: result.startAt,
        };
      }
    }
  }();
  return reduceSignalProfile(signals);
};
