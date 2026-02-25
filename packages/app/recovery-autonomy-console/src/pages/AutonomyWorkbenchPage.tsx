import { AutonomyCommandCenter } from '../components/AutonomyCommandCenter';
import { AutonomySignalBoard } from '../components/AutonomySignalBoard';
import { AutonomyTopologyMap } from '../components/AutonomyTopologyMap';

interface AutonomyWorkbenchPageProps {
  readonly tenantId: string;
  readonly graphId: string;
  readonly scope: 'discover' | 'simulate' | 'assess' | 'orchestrate' | 'verify' | 'heal';
}

export const AutonomyWorkbenchPage = ({ tenantId, graphId, scope }: AutonomyWorkbenchPageProps) => {
  return (
    <main style={{ display: 'grid', gap: 16, padding: 20 }}>
      <h1>Recovery Autonomy Workbench</h1>
      <p style={{ opacity: 0.8 }}>Run and inspect coordinated recovery intelligence signals.</p>
      <AutonomyCommandCenter tenantId={tenantId} graphId={graphId} scope={scope} />
      <AutonomySignalBoard tenantId={tenantId} graphId={graphId} scope={scope} />
      <AutonomyTopologyMap tenantId={tenantId} graphId={graphId} />
    </main>
  );
};
