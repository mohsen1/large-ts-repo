import { useMemo } from 'react';
import type { ReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';

interface OperationsReadinessPanelProps {
  readonly profile: ReadinessProfile;
}

export const OperationsReadinessPanel = ({ profile }: OperationsReadinessPanelProps) => {
  const summary = useMemo(() => {
    const trendLabel = profile.averageScore > 0.8 ? 'high' : profile.averageScore > 0.5 ? 'medium' : 'low';
    const projection = profile.worstProjection;
    return `${trendLabel} readiness / projection=${projection} / pressure=${profile.averagePressure.toFixed(2)} window=${profile.windowMinutes}m`;
  }, [profile]);

  return (
    <section className="operations-readiness-panel">
      <h3>Readiness summary</h3>
      <p>{summary}</p>
      <dl>
        <dt>Tenant</dt>
        <dd>{profile.tenant}</dd>
        <dt>Snapshots</dt>
        <dd>{profile.snapshots.length}</dd>
        <dt>Average score</dt>
        <dd>{profile.averageScore.toFixed(4)}</dd>
        <dt>Average pressure</dt>
        <dd>{profile.averagePressure.toFixed(4)}</dd>
      </dl>

      <ul>
        {profile.snapshots.map((snapshot) => (
          <li key={`${snapshot.runId}-${snapshot.generatedAt}`}>
            Run {snapshot.runId}: {snapshot.projection} score={snapshot.score.toFixed(4)}
          </li>
        ))}
      </ul>
    </section>
  );
};
