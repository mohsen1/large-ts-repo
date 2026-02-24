import type { FC } from 'react';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';

interface PlanRouteTimelineProps {
  readonly steps: readonly GraphStep<string>[];
  readonly selectedPhase?: string;
  readonly onSelect?: (phase: string) => void;
}

const intensityColor: Record<'calm' | 'elevated' | 'extreme', string> = {
  calm: '#2f855a',
  elevated: '#b7791f',
  extreme: '#c53030',
};

export const PlanRouteTimeline: FC<PlanRouteTimelineProps> = ({ steps, selectedPhase, onSelect }) => {
  const byPhase = steps.reduce<Map<string, GraphStep<string>[]>>((acc, step) => {
    const current = acc.get(step.phase) ?? [];
    acc.set(step.phase, [...current, step]);
    return acc;
  }, new Map());

  const rows = [...byPhase.entries()];
  return (
    <section style={{ border: '1px solid #dbedff', borderRadius: 8, padding: 10 }}>
      <h3>Plan timeline</h3>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {rows.map(([phase, route]) => {
          const phaseTotal = route.reduce((acc, step) => acc + step.estimatedMs, 0);
          return (
            <li
              key={phase}
              style={{
                border: `1px solid ${phase === selectedPhase ? '#5f3dc4' : '#dbeafe'}`,
                borderRadius: 6,
                padding: 8,
                background: phase === selectedPhase ? '#f5f3ff' : '#fcfcfd',
              }}
            >
              <button
                type="button"
                onClick={() => onSelect?.(phase)}
                style={{
                  border: 0,
                  padding: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <strong>{phase}</strong>
                {' '}
                ·
                {' '}
                {route.length}
                {' '}
                steps ·
                {' '}
                {phaseTotal}ms
              </button>
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                {route.map((step) => (
                  <div key={step.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{step.name}</span>
                    <span style={{ color: intensityColor[step.intensity] }}>{step.intensity}</span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
