import { useMemo } from 'react';
import type { DrillRunSnapshot } from '@domain/recovery-drill-lab';

interface Props {
  readonly snapshots: readonly DrillRunSnapshot[];
}

export const RunProgressTimeline = ({ snapshots }: Props) => {
  const segments = useMemo(
    () =>
      snapshots.flatMap((snapshot) =>
        snapshot.steps.map((step, stepIndex) => ({
          key: `${snapshot.id}-${step.id}`,
          label: `${snapshot.scenarioName} #${stepIndex + 1}`,
          status: step.status,
          owner: step.owner,
          phase: step.family,
        })),
      ),
    [snapshots],
  );

  if (!segments.length) {
    return <p>No timeline data loaded</p>;
  }

  return (
    <section>
      <h4>Progress timeline</h4>
      <ul>
        {segments.map((segment) => (
          <li key={segment.key}>
            <strong>{segment.label}</strong> — {segment.phase} — {segment.status} — {segment.owner}
          </li>
        ))}
      </ul>
    </section>
  );
};
