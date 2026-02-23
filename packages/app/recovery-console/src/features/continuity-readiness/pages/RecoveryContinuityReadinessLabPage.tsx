import type { ReactElement } from 'react';
import { ContinuityReadinessRunbook } from '../components/ContinuityReadinessRunbook';
import { ContinuityReadinessRadar } from '../components/ContinuityReadinessRadar';
import { ContinuityReadinessSignalPanel } from '../components/ContinuityReadinessSignalPanel';
import { useContinuityReadinessWorkspace } from '../hooks/useContinuityReadinessWorkspace';

export const RecoveryContinuityReadinessLabPage = (): ReactElement => {
  const state = useContinuityReadinessWorkspace({
    tenantId: 'tenant-continuity-readiness',
    tenantName: 'Continuity Tenant Alpha',
    surfaceId: 'tenant-continuity-readiness-east',
  });

  return (
    <main>
      <h1>Continuity Readiness Lab</h1>
      <p>{`status: ${state.status}`}</p>
      <p>{state.summary}</p>
      <p>{`errors: ${state.errors.length}`}</p>
      <button type="button" onClick={() => void state.refresh()}>Refresh workspace</button>
      <button type="button" onClick={() => void state.runOrchestration()} style={{ marginLeft: 8 }}>
        Run orchestration
      </button>
      <ContinuityReadinessRadar title="Coverage radar" coverage={state.coverage} />
      <ContinuityReadinessSignalPanel title="Signal panel" envelope={state.envelope} />
      <ContinuityReadinessRunbook envelope={state.envelope} />
    </main>
  );
};
