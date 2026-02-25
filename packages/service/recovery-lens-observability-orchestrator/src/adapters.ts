import type { MetricRecord } from '@domain/recovery-lens-observability-models';
import { splitIntoWindows } from '@data/recovery-lens-observability-store';
import { InMemoryLensStore } from '@data/recovery-lens-observability-store';
import { observerNamespace } from '@domain/recovery-lens-observability-models';

export type AdapterResult<TPayload extends Record<string, unknown>> = {
  readonly namespace: string;
  readonly count: number;
  readonly points: readonly MetricRecord<TPayload>[];
};

export class LensPointAdapter<TPayload extends Record<string, unknown>> {
  readonly #store: InMemoryLensStore;
  public constructor(namespace: string) {
    this.#store = new InMemoryLensStore(observerNamespace(`namespace:${namespace}`));
  }

  public async ingest(source: Iterable<TPayload>): Promise<AdapterResult<TPayload>> {
    const points: MetricRecord<TPayload>[] = [];
    let index = 0;
    for (const payload of source) {
      points.push({
        timestamp: new Date().toISOString(),
        namespace: observerNamespace(`${this.#store.namespace}-record-${index}`),
        metric: `metric:${index}`,
        payload,
        severity: 'info',
      });
      index += 1;
    }

    const windows = splitIntoWindows(points, Math.max(1, Math.floor(points.length / 3)));
    await this.#store.ingest(this.#store.namespace, windows.flat() as readonly MetricRecord<TPayload>[]);
    return {
      namespace: String(this.#store.namespace),
      count: points.length,
      points,
    };
  }

  public async normalize(points: readonly MetricRecord<TPayload>[]): Promise<readonly MetricRecord<TPayload>[]> {
    return points.toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
  }
}

export const collectPoints = async <TPayload extends Record<string, unknown>>(
  source: Iterable<TPayload>,
): Promise<readonly TPayload[]> => {
  const output: TPayload[] = [];
  for (const value of source) {
    output.push(value);
  }
  return output;
};
