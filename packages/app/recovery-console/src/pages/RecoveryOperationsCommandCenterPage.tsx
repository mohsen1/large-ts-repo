import { useRecoveryOperationsCommandCenter } from '../hooks/useRecoveryOperationsCommandCenter';
import { RecoveryOperationsCommandCenter } from '../components/RecoveryOperationsCommandCenter';
import { RecoveryCommandTimeline } from '../components/RecoveryCommandTimeline';
import { OperationsReadinessPanel } from '../components/OperationsReadinessPanel';
import type { ReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';

const defaultProfile: ReadinessProfile = {
  tenant: 'global',
  windowMinutes: 30,
  snapshots: [],
  averageScore: 0,
  averagePressure: 0,
  worstProjection: 'unknown',
};

export const RecoveryOperationsCommandCenterPage = () => {
  const workspace = useRecoveryOperationsCommandCenter();

  return (
    <main className="recovery-operations-command-center-page">
      <RecoveryOperationsCommandCenter />
      <OperationsReadinessPanel profile={workspace.state.readinessPlan
        ? defaultProfile
        : defaultProfile} />
      <RecoveryCommandTimeline events={workspace.state.commandRequests} />
      <section>
        <h3>Tenant metadata</h3>
        <p>{workspace.state.tenant}</p>
        <p>Plan owner: {workspace.state.readinessPlan.metadata.owner}</p>
        <p>Tags: {workspace.state.readinessPlan.metadata.tags.join(', ') || 'none'}</p>
      </section>
    </main>
  );
};
