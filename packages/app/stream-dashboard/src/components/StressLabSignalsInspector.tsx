import { useMemo } from 'react';
import { type RecoverySignal } from '@domain/recovery-stress-lab';

export interface StressLabSignalsInspectorProps {
  readonly title: string;
  readonly signals: readonly RecoverySignal[];
}

type SeverityBucket = {
  readonly className: string;
  readonly count: number;
  readonly labels: readonly string[];
};

const buildBuckets = (signals: readonly RecoverySignal[]): readonly SeverityBucket[] => {
  const grouped = signals.reduce<Record<string, string[]>>((acc, signal) => {
    acc[signal.class] = [...(acc[signal.class] ?? []), signal.id];
    return acc;
  }, {});

  return Object.entries(grouped).map(([className, labels]) => ({
    className,
    count: labels.length,
    labels,
  }));
};

export const StressLabSignalsInspector = ({ title, signals }: StressLabSignalsInspectorProps) => {
  const buckets = useMemo(() => buildBuckets(signals), [signals]);
  const sorted = useMemo(
    () => [...buckets].sort((left, right) => right.count - left.count),
    [buckets],
  );
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {sorted.map((bucket) => (
          <li key={bucket.className}>
            <strong>{bucket.className}</strong>: {bucket.count}
            <div>{bucket.labels.slice(0, 4).join(', ')}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const summarizeSignalBuckets = (signals: readonly RecoverySignal[]): readonly {
  readonly className: string;
  readonly count: number;
}[] => buildBuckets(signals).map((bucket) => ({
  className: bucket.className,
  count: bucket.count,
}));
