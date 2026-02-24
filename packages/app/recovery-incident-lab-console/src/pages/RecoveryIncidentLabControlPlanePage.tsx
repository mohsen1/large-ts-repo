import { type ReactElement } from 'react';
import { RecoveryLabControlPlanePanel } from '../components/RecoveryLabControlPlanePanel';
import { RecoveryLabTopologyMatrix } from '../components/RecoveryLabTopologyMatrix';
import { useRecoveryLabControlPlane } from '../hooks/useRecoveryLabControlPlane';
import { useRecoveryLabGovernanceInsights } from '../hooks/useRecoveryLabGovernanceInsights';

export const RecoveryIncidentLabControlPlanePage = (): ReactElement => {
  const { events } = useRecoveryLabControlPlane();
  const { readiness, warnings, adapterKey } = useRecoveryLabGovernanceInsights();

  return (
    <main className="recovery-incident-lab-control-plane-page">
      <h1>Recovery Incident Lab Control Plane</h1>
      <section>
        <p>Readiness score: {readiness}</p>
        <p>Warnings: {warnings.join(' | ')}</p>
        <p>Adapter: {adapterKey}</p>
      </section>
      <RecoveryLabControlPlanePanel />
      <RecoveryLabTopologyMatrix title="Topology matrix" events={events} />
    </main>
  );
};
