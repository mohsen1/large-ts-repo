import type { FC } from 'react';
import { useMemo } from 'react';
import type { ForecastSummary } from '@domain/recovery-simulation-lab-core';
import { statusClass, type RecoveryLabConductorState } from '../hooks/useRecoveryLabConductor';

interface RecoveryLabSignalForecastPanelProps {
  readonly state: RecoveryLabConductorState;
  readonly forecast: ForecastSummary | null;
}

const toWindowLabel = (index: number, value: { from: number; to: number }): string => `${index}-${value.from}-${value.to}`;

const metricFromSummary = (summary: ForecastSummary | null): readonly [string, number][] => {
  if (!summary) {
    return [];
  }
  return summary.topSignals.map(([label, score], index) => [`${index}:${label}`, score]);
};

export const RecoveryLabSignalForecastPanel: FC<RecoveryLabSignalForecastPanelProps> = ({ state, forecast }) => {
  const rows = useMemo(() => metricFromSummary(forecast), [forecast]);
  const status = statusClass(state.status);

  return (
    <section
      style={{
        border: '1px solid #d7d7d7',
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <h2>Signal forecast · {status}</h2>
      <p>{state.summary?.tenant ?? 'tenant:unknown'}</p>
      <section>
        <h3>Forecast windows</h3>
        {forecast === null ? (
          <p>no forecast</p>
        ) : (
          <ul>
            {forecast.windows.map((window, index) => {
              const key = toWindowLabel(index, window);
              return (
                <li key={key}>
                  window={window.from}:{window.to}, mean={window.mean.toFixed(2)},
                  max={window.max.toFixed(2)}, min={window.min.toFixed(2)}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h3>Top signals</h3>
        <ul>
          {rows.length === 0 ? <li>no signal data</li> : rows.slice(0, 12).map(([label, score]) => <li key={label}>{label}: {score}</li>)}
        </ul>
      </section>
    </section>
  );
};
