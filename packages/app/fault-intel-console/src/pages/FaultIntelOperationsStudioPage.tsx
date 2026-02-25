import { useMemo } from 'react';
import { useFaultIntelStudio } from '../hooks/useFaultIntelStudio';
import { FaultIntelPolicyDeck } from '../components/FaultIntelPolicyDeck';
import { FaultIntelSignalBoard } from '../components/FaultIntelSignalBoard';
import { FaultIntelTimeline } from '../components/FaultIntelTimeline';

import type { TenantId, WorkspaceId } from '@domain/fault-intel-orchestration';

const pageTenant = 'tenant::demo-console' as TenantId;
const pageWorkspace = 'workspace::demo-console' as WorkspaceId;

export const FaultIntelOperationsStudioPage = () => {
  const { state, runCampaign, togglePhase } = useFaultIntelStudio({
    tenantId: pageTenant,
    workspaceId: pageWorkspace,
  });

  const statusClass = useMemo(() => {
    switch (state.mode) {
      case 'running':
        return 'bg-sky-500';
      case 'complete':
        return 'bg-emerald-600';
      case 'error':
        return 'bg-rose-600';
      default:
        return 'bg-slate-500';
    }
  }, [state.mode]);

  return (
    <main style={{ padding: 20, minHeight: '100vh', background: '#020617', color: '#f8fafc', fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Fault intel operations studio</h1>
        <p style={{ marginTop: 6, color: '#cbd5e1' }}>Plan, execute, and review campaign workflows with deterministic plugin pipelines.</p>
        <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
          Current status: <span className={statusClass}>{state.mode}</span>
        </p>
      </header>

      <section style={{ display: 'grid', gap: 12 }}>
        <button
          type="button"
          onClick={runCampaign}
          disabled={state.mode === 'running'}
          style={{
            alignSelf: 'start',
            border: 'none',
            borderRadius: 12,
            padding: '10px 14px',
            color: '#ffffff',
            background: state.mode === 'running' ? '#334155' : '#14b8a6',
            fontWeight: 700,
          }}
        >
          {state.mode === 'running' ? 'Executing campaign...' : 'Run orchestrated campaign'}
        </button>

        {state.error ? <p style={{ color: '#fca5a5' }}>{state.error}</p> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <FaultIntelSignalBoard signalCount={state.signalCount} onSelectPhase={togglePhase} run={state.run} />

          <div>
            <FaultIntelPolicyDeck onRefresh={runCampaign} run={state.run} />
            <FaultIntelTimeline run={state.run} />
          </div>
        </div>

        <aside style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Planner metadata</h3>
          <p>Phases selected: {state.selectedPhases.join(' -> ')}</p>
          <p>Plan signature: {state.planSignature ?? 'n/a'}</p>
        </aside>
      </section>
    </main>
  );
};
