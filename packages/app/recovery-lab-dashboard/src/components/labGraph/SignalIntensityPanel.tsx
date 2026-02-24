import type { FC } from 'react';

interface SignalRow {
  readonly id: string;
  readonly plugin: string;
  readonly phase: string;
  readonly value: number;
}

interface SignalIntensityPanelProps {
  readonly signals: readonly SignalRow[];
  readonly onReplay?: (id: string) => void;
}

export const SignalIntensityPanel: FC<SignalIntensityPanelProps> = ({ signals, onReplay }) => {
  if (signals.length === 0) {
    return (
      <section>
        <h3>Signal stream</h3>
        <p>no signal history yet</p>
      </section>
    );
  }

  const min = Math.min(...signals.map((entry) => entry.value));
  const max = Math.max(...signals.map((entry) => entry.value));
  const spread = max - min || 1;

  return (
    <section style={{ border: '1px solid #dfdfdf', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Signal stream</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {signals.map((entry) => {
          const width = ((entry.value - min) / spread) * 100;
          return (
            <li key={`${entry.id}-${entry.phase}`} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{entry.plugin}</strong>
                <span>{entry.phase}</span>
              </div>
              <button
                type="button"
                onClick={() => onReplay?.(entry.id)}
                style={{
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: '#2b6cb0',
                  cursor: 'pointer',
                }}
              >
                replay
              </button>
              <div style={{ width: '100%', background: '#edf2f7', borderRadius: 999, height: 8, marginTop: 4 }}>
                <div
                  style={{
                    width: `${width}%`,
                    background: 'linear-gradient(90deg, #63b3ed, #2c5282)',
                    height: '100%',
                    borderRadius: 999,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
