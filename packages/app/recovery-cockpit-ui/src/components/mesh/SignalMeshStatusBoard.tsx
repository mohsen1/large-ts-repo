import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { MeshEnvelope, MeshExecutionPhase } from '@domain/recovery-cockpit-signal-mesh';

const PHASES = ['detect', 'assess', 'orchestrate', 'simulate', 'execute', 'observe', 'recover', 'settle'] as const;

type Phase = (typeof PHASES)[number];

export interface SignalMeshStatusBoardProps {
  readonly snapshots: readonly MeshEnvelope[];
  readonly selectedPhase?: MeshExecutionPhase;
  readonly onPhaseSelect?: (phase: Phase) => void;
}

const phaseCounts = (snapshots: readonly MeshEnvelope[]): Readonly<Record<Phase, number>> =>
  snapshots.reduce<Record<Phase, number>>(
    (acc, snapshot) => {
      const phase = snapshot.event.phase;
      acc[phase] = (acc[phase] ?? 0) + 1;
      return acc;
    },
    {
      detect: 0,
      assess: 0,
      orchestrate: 0,
      simulate: 0,
      execute: 0,
      observe: 0,
      recover: 0,
      settle: 0,
    },
  );

export function SignalMeshStatusBoard({ snapshots, selectedPhase, onPhaseSelect }: SignalMeshStatusBoardProps): ReactElement {
  const counts = useMemo(() => phaseCounts(snapshots), [snapshots]);
  const total = useMemo(() => Object.values(counts).reduce((acc, next) => acc + next, 0), [counts]);

  return (
    <section>
      <h3>Mesh Status</h3>
      <ul>
        {PHASES.map((phase) => (
          <li key={phase}>
            <button
              type="button"
              onClick={() => onPhaseSelect?.(phase)}
              data-active={selectedPhase === phase}
              style={{ marginBottom: 4 }}
            >
              {phase}: {counts[phase]} ({total === 0 ? 0 : ((counts[phase] / total) * 100).toFixed(1)}%)
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
