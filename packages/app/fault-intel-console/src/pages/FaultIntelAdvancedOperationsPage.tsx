import { useMemo } from 'react';
import { useFaultIntelStudio } from '../hooks/useFaultIntelStudio';
import { FaultIntelCampaignWorkbench } from '../components/FaultIntelCampaignWorkbench';
import { FaultIntelRiskDashboard } from '../components/FaultIntelRiskDashboard';
import { FaultIntelPolicyDeck } from '../components/FaultIntelPolicyDeck';
import { FaultIntelSignalBoard } from '../components/FaultIntelSignalBoard';
import { FaultIntelTimeline } from '../components/FaultIntelTimeline';
import type { TenantId, WorkspaceId } from '@domain/fault-intel-orchestration';

type ConsoleTheme = 'cold' | 'warm' | 'alert';

interface ViewModel {
  readonly theme: ConsoleTheme;
  readonly title: string;
}

const pageTenant = 'tenant::demo-console' as TenantId;
const pageWorkspace = 'workspace::demo-console' as WorkspaceId;

const resolveTheme = (signals: number, mode: string): ViewModel => {
  if (signals === 0) {
    return { theme: 'cold', title: 'Idle matrix' };
  }
  if (mode === 'running') {
    return { theme: 'warm', title: 'Execution underway' };
  }
  if (signals >= 80) {
    return { theme: 'alert', title: 'High signal density' };
  }
  return { theme: 'cold', title: 'Stable command center' };
};

export const FaultIntelAdvancedOperationsPage = () => {
  const { state, runCampaign, togglePhase } = useFaultIntelStudio({
    tenantId: pageTenant,
    workspaceId: pageWorkspace,
  });

  const model: ViewModel = useMemo(
    () => resolveTheme(state.signalCount, state.mode),
    [state.mode, state.signalCount],
  );

  const bodyBackground = model.theme === 'alert'
    ? '#1f2937'
    : model.theme === 'warm'
      ? '#0f172a'
      : '#020617';

  return (
    <main style={{ padding: 20, minHeight: '100vh', background: bodyBackground, color: '#f8fafc', fontFamily: 'Trebuchet MS, ui-sans-serif, system-ui' }}>
      <header style={{ marginBottom: 18 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', margin: 0 }}>Fault intel command console</p>
        <h1 style={{ margin: 4, color: '#f8fafc' }}>{model.title}</h1>
        <p style={{ color: '#cbd5e1', marginBottom: 0 }}>Advanced execution mode with layered diagnostics and plugin orchestration.</p>
      </header>

      <button
        type="button"
        onClick={runCampaign}
        disabled={state.mode === 'running'}
        style={{
          border: '1px solid #1d4ed8',
          background: state.mode === 'running' ? '#334155' : '#1d4ed8',
          color: '#fff',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 12,
        }}
      >
        {state.mode === 'running' ? 'Running advanced plan...' : 'Run advanced command plan'}
      </button>

      {state.error ? <p style={{ color: '#fca5a5' }}>{state.error}</p> : null}

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <FaultIntelCampaignWorkbench run={state.run} onNavigatePhase={togglePhase} />

        <FaultIntelRiskDashboard run={state.run} onRefresh={runCampaign} />
      </section>

      <section style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <FaultIntelPolicyDeck run={state.run} onRefresh={runCampaign} />
        <FaultIntelSignalBoard signalCount={state.signalCount} onSelectPhase={togglePhase} run={state.run} />
      </section>

      <FaultIntelTimeline run={state.run} />
    </main>
  );
};
