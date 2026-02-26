import { useMemo } from 'react';
import type { SyntheticRunState } from '../../hooks/useSyntheticHorizon';

export interface SyntheticTimelineProps {
  readonly timeline: readonly string[];
  readonly state: SyntheticRunState;
  readonly summary: {
    readonly elapsedMs: number;
    readonly stageCount: number;
    readonly okCount: number;
    readonly failCount: number;
  };
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const toPercent = (value: number): number => clamp(value, 0, 100);

export const SyntheticTimeline = ({ timeline, state, summary }: SyntheticTimelineProps) => {
  const width = useMemo(() => {
    const safe = summary.stageCount > 0 ? summary.stageCount : 1;
    return timeline.length / safe;
  }, [timeline.length, summary.stageCount]);

  const ratio = useMemo(() => {
    const pass = summary.okCount;
    const fail = summary.failCount;
    const total = pass + fail || 1;
    return toPercent((pass / total) * 100);
  }, [summary.okCount, summary.failCount]);

  return (
    <section className="synthetic-timeline">
      <h3>Execution timeline</h3>
      <p>Ratio: {ratio}%</p>
      <p>Elapsed: {state.elapsedMs}ms</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${timeline.length || 1}, minmax(0, 1fr))`,
          gap: '0.5rem',
        }}
      >
        {timeline.map((entry, index) => {
          const active = index < state.okCount + state.failCount;
          const success = index < state.okCount;
          return (
            <div
              key={`${entry}-${index}`}
              title={entry}
              style={{
                background: success ? '#16a34a' : active ? '#dc2626' : '#94a3b8',
                padding: '0.4rem',
                color: 'white',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '0.75rem',
                transform: `scale(${1 + index * 0.002 * width})`,
              }}
            >
              {entry}
            </div>
          );
        })}
      </div>
      <dl>
        <dt>Run state</dt>
        <dd>{state.state}</dd>
        <dt>Run id</dt>
        <dd>{state.runId ?? 'pending'}</dd>
      </dl>
    </section>
  );
};
