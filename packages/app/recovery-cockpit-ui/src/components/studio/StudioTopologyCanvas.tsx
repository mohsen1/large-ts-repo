import { FC } from 'react';
import type { StudioRunState } from '@service/recovery-orchestration-studio-engine';

export type StudioTopologyCanvasProps = {
  readonly runs: readonly StudioRunState[];
  readonly onSelect: (run: StudioRunState) => void;
};

type StagePosition = {
  readonly phase: string;
  readonly order: number;
};

const groupPhases = (run: StudioRunState): readonly StagePosition[] => {
  const known = new Map<string, number>();
  for (const tick of run.ticks) {
    const current = known.get(tick.phase) ?? 0;
    known.set(tick.phase, current + 1);
  }
  return [...known.entries()].map(([phase, order]) => ({ phase, order }));
};

export const StudioTopologyCanvas: FC<StudioTopologyCanvasProps> = ({ runs, onSelect }) => {
  if (runs.length === 0) {
    return <p>No studio runs available.</p>;
  }

  return (
    <section>
      <h3>Studio topology map</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {runs.map((run) => {
          const phases = groupPhases(run);
          return (
            <li key={run.sessionId}>
              <button
                type="button"
                onClick={() => onSelect(run)}
                style={{
                  marginBottom: 12,
                  width: '100%',
                  display: 'grid',
                  gap: 8,
                  justifyItems: 'start',
                }}
              >
                <span>{run.sessionId}</span>
                <span>{run.status}</span>
                <span>
                  phases {phases.length} · {run.ticks.length} ticks
                </span>
                <span style={{ opacity: 0.8 }}>
                  {phases.map((phase) => `${phase.phase}(${phase.order})`).join(' → ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

