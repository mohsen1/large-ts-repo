import { useMemo } from 'react';
import type { ContinuityRunResult } from '@domain/recovery-continuity-lab-core';

interface ContinuityReadinessPulseProps {
  readonly runs: ReadonlyArray<ContinuityRunResult>;
}

interface PulsePoint {
  readonly label: string;
  readonly value: number;
}

export const ContinuityReadinessPulse = ({ runs }: ContinuityReadinessPulseProps) => {
  const points = useMemo<PulsePoint[]>(
    () =>
      runs.map((run, index) => {
        const score = run.outcomes[0]?.coverage ?? 0;
        return {
          label: `run-${index + 1}`,
          value: Number((score * 100).toFixed(1)),
        };
      }),
    [runs],
  );

  if (points.length === 0) {
    return <p>No signal pulses yet</p>;
  }

  const max = Math.max(...points.map((point) => point.value));

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.7rem', background: '#0f172a' }}>
      <h2 style={{ marginTop: 0 }}>Readiness pulse</h2>
      <div style={{ display: 'grid', gap: '0.45rem' }}>
        {points.map((point) => (
          <div key={point.label} style={{ display: 'grid', gap: '0.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{point.label}</strong>
              <span>{point.value.toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, border: '1px solid #334155', position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${point.value}%`,
                  background: `linear-gradient(90deg, #6366f1 ${Math.min(100, max)}, #334155 0)`,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
