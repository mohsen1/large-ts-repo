import { createIteratorChain } from './iterator';
import type { TemplatePath, EventEnvelope } from './types';

export interface TraceSample {
  readonly key: string;
  readonly value: number;
  readonly weight: number;
}

export type TraceId = TemplatePath<['trace', 'sample', string]>;

export interface TraceBuffer {
  push(sample: TraceSample): void;
  summary(): TraceSummary;
  drain(): readonly TraceSample[];
}

export interface TraceSummary {
  readonly count: number;
  readonly totalWeight: number;
  readonly averageValue: number;
  readonly sampleKeys: readonly string[];
}

export const createTraceBuffer = (capacity: number): TraceBuffer => {
  const samples: TraceSample[] = [];

  const trim = () => {
    while (samples.length > capacity) {
      samples.shift();
    }
  };

  return {
    push(sample) {
      samples.push(sample);
      trim();
    },
    summary() {
      const [count, sum, weighted] = samples.reduce(
        ([itemCount, itemSum, weightSum], sample) => [
          itemCount + 1,
          itemSum + sample.value,
          weightSum + sample.weight,
        ],
        [0, 0, 0],
      );
      return {
        count,
        totalWeight: weighted,
        averageValue: count === 0 ? 0 : sum / count,
        sampleKeys: createIteratorChain(samples).map((sample) => sample.key).toArray(),
      };
    },
    drain() {
      return samples.splice(0, samples.length);
    },
  };
};

export const enrichEvent = <TKind extends string>(
  event: EventEnvelope<string, TKind, unknown>,
): EventEnvelope<string, TKind, { readonly sourceEvent: EventEnvelope<string, TKind, unknown> }> => {
  return {
    source: event.source,
    kind: event.kind,
    type: event.type,
    payload: { sourceEvent: event },
    createdAt: event.createdAt,
  };
};
