import { useMemo } from 'react';
import type { LatticeSignalEvent } from '@data/recovery-lattice-store';

interface LatticePolicySignalsProps {
  readonly signals: readonly LatticeSignalEvent[];
  readonly onRefresh: () => void;
}

type SignalSeverity = 'ok' | 'warn' | 'critical';

interface SignalBucket {
  readonly kind: SignalSeverity;
  readonly count: number;
  readonly sample: string;
}

const classify = (level: string): SignalSeverity => {
  if (level === 'critical') return 'critical';
  if (level === 'elevated' || level === 'warning') return 'warn';
  return 'ok';
};

const severityWeight = {
  ok: 1,
  warn: 2,
  critical: 3,
} as const;

const pickTopSignal = (signals: readonly LatticeSignalEvent[]): LatticeSignalEvent | undefined =>
  signals
    .toSorted((left, right) => severityWeight[classify(right.level as string)] - severityWeight[classify(left.level as string)])
    .find(() => true);

export const LatticePolicySignals = ({ signals, onRefresh }: LatticePolicySignalsProps) => {
  const buckets = useMemo<readonly SignalBucket[]>(() => {
    const aggregate = signals.reduce<Record<SignalSeverity, number>>(
      (acc, signal) => {
        const severity = classify(signal.level as string);
        acc[severity] = (acc[severity] ?? 0) + 1;
        return acc;
      },
      { ok: 0, warn: 0, critical: 0 },
    );

    return (['ok', 'warn', 'critical'] as const).map((kind) => ({
      kind,
      count: aggregate[kind],
      sample: `${kind}: ${aggregate[kind]}`,
    }));
  }, [signals]);

  const top = pickTopSignal(signals);

  return (
    <section>
      <h3>Policy Signal Distribution</h3>
      <button type="button" onClick={onRefresh} style={{ marginBottom: 8 }}>Refresh Policy</button>
      <ul>
        {buckets.map((bucket) => (
          <li key={bucket.kind}>
            {bucket.kind} — {bucket.count}
          </li>
        ))}
      </ul>
      <p>Primary: {top ? `${top.level}@${top.score.toFixed(2)}` : 'none'}</p>
    </section>
  );
};
