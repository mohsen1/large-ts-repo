import { useMemo, useState } from 'react';
import { useRecoveryCommandConductor } from '../hooks/useRecoveryCommandConductor';
import { ConductorTimeline } from '../components/ConductorTimeline';
import { ConductorTopologyPanel } from '../components/ConductorTopologyPanel';
import { ConductorPolicyPanel } from '../components/ConductorPolicyPanel';
import { ConductorSignalMatrix } from '../components/ConductorSignalMatrix';
import { normalizeStatus, type ConductorSurfaceMode } from '../types';

export const RecoveryCommandConductorPage = ({ tenantId }: { tenantId: string }) => {
  const [surface, setSurface] = useState<ConductorSurfaceMode>('overview');
  const { state, actions } = useRecoveryCommandConductor(tenantId);
  const status = normalizeStatus(state.status);
  const actionLabel = status === 'running' ? 'stop' : status === 'idle' ? 'start' : 'reset';

  const activeSurface = useMemo(() => {
    if (surface === 'overview') {
      return (
        <ConductorTopologyPanel workspace={state.workspace} />
      );
    }
    if (surface === 'signal') {
      return (
        <ConductorSignalMatrix tenant={tenantId} cells={state.workspace.signals} />
      );
    }
    if (surface === 'policy') {
      return <ConductorPolicyPanel workspace={state.workspace} onPin={(runbook) => console.info('pin', runbook)} />;
    }
    return <ConductorTimeline timeline={state.timeline} />;
  }, [surface, state.workspace, state.timeline, tenantId]);

  return (
    <main>
      <h1>Recovery Command Conductor</h1>
      <p>{`tenant ${tenantId}`}</p>
      <p>{`status ${status}`}</p>
      <p>{`phase ${state.phase ?? 'idle'}`}</p>

      <nav>
        <button type="button" onClick={() => setSurface('overview')}>
          overview
        </button>
        <button type="button" onClick={() => setSurface('signal')}>
          signals
        </button>
        <button type="button" onClick={() => setSurface('policy')}>
          policy
        </button>
        <button type="button" onClick={() => setSurface('timeline')}>
          timeline
        </button>
      </nav>

      <article>
        {activeSurface}
      </article>

      <div>
        {actionLabel === 'stop' ? (
          <button type="button" onClick={actions.stop}>
            stop run
          </button>
        ) : actionLabel === 'start' ? (
          <button type="button" onClick={actions.start}>
            start run
          </button>
        ) : (
          <button type="button" onClick={actions.reset}>
            reset
          </button>
        )}
      </div>
    </main>
  );
};
