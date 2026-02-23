import { useMemo } from 'react';
import type { CommandOrchestrationResult } from '@domain/recovery-ops-orchestration-surface';

interface RecoveryOpsSurfaceTimelineProps {
  readonly result: CommandOrchestrationResult;
}

const formatPhase = (phase: string): string => `${phase[0].toUpperCase()}${phase.slice(1)}`;

export const RecoveryOpsSurfaceTimeline = ({ result }: RecoveryOpsSurfaceTimelineProps) => {
  const rows = useMemo(
    () =>
      result.coverage.map((coverage) => ({
        label: formatPhase(coverage.phase),
        ratio: coverage.totalStepCount === 0 ? 0 : coverage.coveredStepCount / coverage.totalStepCount,
      })),
    [result.coverage],
  );

  return (
    <section>
      <h4>Execution Timeline</h4>
      <div>
        {rows.map((entry) => (
          <div
            key={entry.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span>{entry.label}</span>
            <progress value={entry.ratio} max={1} />
          </div>
        ))}
      </div>
      <p>
        project completion {new Date(result.projectedCompletionAt).toLocaleString()}
      </p>
    </section>
  );
};
