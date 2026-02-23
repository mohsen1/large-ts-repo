import { useMemo } from 'react';
import { useIncidentFusionPulse } from '../../hooks/incident-fusion/useIncidentFusionPulse';
import type { RecoverySignal } from '@domain/incident-fusion-models';

export interface Props {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
}

const valueColor = (value: number): string => {
  if (value > 0.75) return '#34d399';
  if (value > 0.5) return '#fbbf24';
  if (value > 0.25) return '#fb923c';
  return '#f87171';
};

export const IncidentFusionPulseChart = ({ tenant, signals }: Props) => {
  const { series } = useIncidentFusionPulse(tenant, signals);

  const total = useMemo(() => {
    return series.reduce((acc, item) => {
      if (item.history.length === 0) return acc;
      const value = item.history[item.history.length - 1]?.value ?? 0;
      return acc + value;
    }, 0);
  }, [series]);

  return (
    <section style={{ marginTop: 12, background: '#0c2237', border: '1px solid #244061', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Pulse chart · {tenant}</h3>
      <p>Tracked signals: {series.length}, tail score: {total.toFixed(2)}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {series.map((entry) => (
          <div key={entry.signalId}>
            <div style={{ marginBottom: 4 }}>{entry.title}</div>
            <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 3 }}>
              {entry.history.map((point, index) => (
                <span
                  key={`${entry.signalId}-${index}`}
                  title={`${point.at}: ${point.value}`}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: valueColor(point.value),
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
