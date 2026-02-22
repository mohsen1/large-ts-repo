import type { StabilitySignal } from '@domain/recovery-stability-models';
import { useMemo } from 'react';

export interface SignalBucketRow {
  readonly alertClass: StabilitySignal['alertClass'];
  readonly serviceCount: number;
  readonly avgDeviation: number;
}

export const createSignalRows = (signals: ReadonlyArray<StabilitySignal>): ReadonlyArray<string> => {
  return [...new Set(signals.map((item) => item.serviceId))];
};

export const buildSignalBuckets = (
  signals: ReadonlyArray<StabilitySignal>,
): ReadonlyArray<SignalBucketRow> => {
  const buckets = new Map<StabilitySignal['alertClass'], StabilitySignal[]>();
  for (const signal of signals) {
    const next = buckets.get(signal.alertClass) ?? [];
    next.push(signal);
    buckets.set(signal.alertClass, next);
  }

  return [...buckets.entries()].map(([alertClass, rows]) => {
    const avgDeviation = rows.reduce((sum, row) => {
      const deviation = row.threshold > 0 ? Math.max(0, row.value - row.threshold) / row.threshold : 0;
      return sum + deviation;
    }, 0) / rows.length;

    return {
      alertClass,
      serviceCount: rows.length,
      avgDeviation: Math.round(avgDeviation * 100),
    };
  });
};

export const StabilityGrid = ({ signals }: { readonly signals: readonly StabilitySignal[] }) => {
  const buckets = useMemo(() => buildSignalBuckets(signals), [signals]);

  return (
    <section>
      <h3>Stability signal buckets</h3>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Service count</th>
            <th>Deviation</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.alertClass}>
              <td>{bucket.alertClass}</td>
              <td>{bucket.serviceCount}</td>
              <td>{bucket.avgDeviation}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
