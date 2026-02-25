import type { MetricRecord } from '@domain/recovery-lens-observability-models';
import { asWindowPriority, observerNamespace, observerWindow, type WindowPolicy } from '@domain/recovery-lens-observability-models';
import type { ObserverNamespace } from '@domain/recovery-lens-observability-models';

export type ClockMode = 'wall' | 'logical' | 'hybrid';

export interface TickValue<TValue> {
  readonly at: number;
  readonly value: TValue;
}

export class LogicalClock {
  #tick = 0;
  public constructor(readonly namespace: ObserverNamespace, readonly mode: ClockMode = 'hybrid') {}

  public tick<TPayload extends Record<string, unknown>>(metric: `metric:${string}`, payload: TPayload): TickValue<MetricRecord<TPayload>> {
    this.#tick += 1;
    return {
      at: this.#tick,
      value: {
        timestamp: new Date().toISOString(),
        namespace: this.namespace,
        metric,
        payload,
        severity: 'info',
      },
    };
  }

  public reset(): void {
    this.#tick = 0;
  }
}

export const makeClockPolicy = (window: string): WindowPolicy => ({
  namespace: observerNamespace('observer:clock'),
  window: observerWindow(window),
  mode: 'realtime',
  ttlMs: 5000,
  priority: asWindowPriority(3),
});

export const splitIntoWindows = <TPayload extends Record<string, unknown>>(
  values: readonly MetricRecord<TPayload>[],
  width: number,
): readonly (readonly MetricRecord<TPayload>[])[] => {
  const bucketSize = Math.max(1, Math.floor(width));
  const output: MetricRecord<TPayload>[][] = [];
  for (let index = 0; index < values.length; index += bucketSize) {
    output.push(values.slice(index, index + bucketSize));
  }
  return output;
};
