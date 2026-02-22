import type { StabilitySignal } from '@domain/recovery-stability-models';
import { useMemo } from 'react';

export interface SignalMatrix {
  readonly countByService: Record<string, number>;
  readonly alertsByClass: Record<string, number>;
}

export const buildSignalMatrix = (signals: ReadonlyArray<StabilitySignal>): SignalMatrix => {
  const countByService: Record<string, number> = {};
  const alertsByClass: Record<string, number> = {};

  for (const signal of signals) {
    countByService[signal.serviceId] = (countByService[signal.serviceId] ?? 0) + 1;
    alertsByClass[signal.alertClass] = (alertsByClass[signal.alertClass] ?? 0) + 1;
  }

  return { countByService, alertsByClass };
};

export const summarizeSignalsByClass = (actions: ReadonlyArray<string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const action of actions) {
    const key = action.includes('critical') ? 'critical' : action.includes('inspect') ? 'watch' : 'none';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

export interface TopSignalsPanelProps {
  readonly matrix: SignalMatrix;
}

export const TopSignalsPanel = ({ matrix }: TopSignalsPanelProps) => {
  const ranking = useMemo(() => {
    return Object.entries(matrix.countByService)
      .map(([service, total]) => ({ service, total }))
      .sort((a, b) => b.total - a.total);
  }, [matrix.countByService]);

  return (
    <section>
      <h3>Top signal services</h3>
      <ul>
        {ranking.map((entry) => (
          <li key={entry.service}>
            <span>{entry.service}</span>
            <strong>{entry.total}</strong>
          </li>
        ))}
      </ul>
      <h4>Class histogram</h4>
      <ul>
        {Object.entries(matrix.alertsByClass).map(([name, count]) => (
          <li key={name}>
            {name}: {count}
          </li>
        ))}
      </ul>
    </section>
  );
};
