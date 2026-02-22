import type { IncidentReadinessSnapshot } from '@service/recovery-stability-orchestrator';

export interface ReadinessPulseProps {
  readonly snapshot?: IncidentReadinessSnapshot;
}

export const ReadinessPulse = ({ snapshot }: ReadinessPulseProps) => {
  if (!snapshot) {
    return <p>No readiness snapshot yet.</p>;
  }

  const tone = snapshot.ready ? 'green' : 'red';

  return (
    <div className={`readiness-pulse readiness-pulse--${tone}`}>
      <strong>{snapshot.ready ? 'READY' : 'NOT READY'}</strong>
      <p>{snapshot.explanation}</p>
    </div>
  );
};
