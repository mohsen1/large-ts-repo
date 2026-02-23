import { useMemo } from 'react';
import type { PlaybookState } from '../hooks/useRecoveryOpsPlaybook';

interface GaugeProps {
  readonly state: PlaybookState;
  readonly threshold?: number;
  readonly title: string;
}

interface ArcSpec {
  readonly index: number;
  readonly name: string;
  readonly fill: string;
  readonly value: number;
}

const baseSegments: ArcSpec[] = [
  { index: 0, name: 'Stability', fill: '#22c55e', value: 70 },
  { index: 1, name: 'Latency', fill: '#f59e0b', value: 22 },
  { index: 2, name: 'Coverage', fill: '#0ea5e9', value: 18 },
  { index: 3, name: 'Containment', fill: '#a855f7', value: 40 },
];

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const ringStyle = (segment: ArcSpec, max: number): React.CSSProperties => {
  const safe = clamp(segment.value);
  const hue = safe === 0 ? 0 : (safe / max) * 360;
  return {
    width: `${120 + segment.index * 18}px`,
    height: `${120 + segment.index * 18}px`,
    borderRadius: '50%',
    border: `8px solid transparent`,
    background: `conic-gradient(from 0deg, hsl(${hue}, 70%, 55%) 0 ${safe}%, rgba(148,163,184,0.2) ${safe}% 100%)`,
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
  };
};

export const RecoveryOpsPlaybookRiskGauge = ({ state, threshold = 70, title }: GaugeProps) => {
  const score =
    state.snapshot?.projection?.confidence !== undefined
      ? state.snapshot.projection.confidence * 100
      : state.runHistory.length > 0
        ? Math.min(100, state.runHistory.length * 12)
        : 45;

  const segments = useMemo(() => {
    const adjusted = baseSegments.map((segment, index) => {
      const value = Math.max(
        2,
        Math.min(100, segment.value + index * 8 + score / 4 - state.runHistory.length),
      );
      return {
        ...segment,
        value,
      };
    });

    const total = adjusted.reduce((acc, item) => acc + item.value, 0);
    if (total === 0) {
      return adjusted;
    }

    return adjusted.map((segment) => ({
      ...segment,
      value: (segment.value / total) * 100,
    }));
  }, [score, state.runHistory.length]);

  const status = score >= threshold ? 'green' : score >= threshold - 20 ? 'yellow' : 'red';

  return (
    <section style={{
      borderRadius: 14,
      padding: '0.85rem',
      color: '#e2e8f0',
      border: '1px solid rgba(148,163,184,0.15)',
      background: 'linear-gradient(140deg, rgba(15,23,42,0.6), rgba(30,41,59,0.75))',
      display: 'grid',
      gap: '0.75rem',
    }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '2.25rem', fontWeight: 700, color: {
            green: '#22c55e',
            yellow: '#f59e0b',
            red: '#ef4444',
          }[status], textAlign: 'center' }}>
            {score.toFixed(1)}
          </div>
          <p style={{ color: '#94a3b8', margin: '0.1rem 0 0' }}>Composite confidence</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
        }}>
          {segments.map((segment) => (
            <div key={segment.name} style={ringStyle(segment, 100)}>
              <div>
                <strong>{segment.name}</strong>
                <p style={{ margin: 0 }}>{segment.value.toFixed(0)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
        {segments.map((segment) => (
          <div key={segment.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{segment.name}</span>
            <span style={{ color: segment.fill }}>{segment.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
};
