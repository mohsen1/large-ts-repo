import { useFaultIntelRouteOrchestrator } from '../hooks/useFaultIntelRouteOrchestrator';
import { FaultIntelDiagnosticsPanel } from '../components/FaultIntelDiagnosticsPanel';
import { FaultIntelRouteMatrix } from '../components/FaultIntelRouteMatrix';
import { FaultIntelSignalTape } from '../components/FaultIntelSignalTape';
import { FaultIntelSignalBoard } from '../components/FaultIntelSignalBoard';
import type { TenantId, WorkspaceId } from '@domain/fault-intel-orchestration';

const controlTenant = 'tenant::control-room' as TenantId;
const controlWorkspace = 'workspace::control-room' as WorkspaceId;

const fallbackPhases = ['intake', 'triage', 'remediation', 'recovery'] as const;

export const FaultIntelIncidentControlRoom = () => {
  const { state, runOrchestrator, phaseCatalog } = useFaultIntelRouteOrchestrator({
    tenantId: controlTenant,
    workspaceId: controlWorkspace,
    phases: fallbackPhases,
  });

  const statusColor = state.mode === 'error'
    ? '#dc2626'
    : state.mode === 'running'
      ? '#1d4ed8'
      : state.mode === 'complete'
        ? '#059669'
        : '#64748b';

  return (
    <main style={{ padding: 20, minHeight: '100vh', background: '#020617', color: '#f8fafc', fontFamily: 'Poppins, ui-sans-serif, system-ui' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>Fault Intel incident control room</h1>
        <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>Phased routing and diagnostics lab for advanced orchestration workflows.</p>
        <p style={{ color: statusColor }}>Current mode: {state.mode}</p>
      </header>

      <button
        type="button"
        onClick={runOrchestrator}
        disabled={state.mode === 'running'}
        style={{ borderRadius: 12, border: '1px solid #2563eb', background: statusColor, color: '#fff', padding: '10px 14px' }}
      >
        {state.mode === 'running' ? 'Running route lab...' : 'Execute control room run'}
      </button>

      {state.error ? <p style={{ color: '#fca5a5' }}>{state.error}</p> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
        <FaultIntelRouteMatrix run={state.runResult} title="Route matrix" />
        <FaultIntelDiagnosticsPanel run={state.runResult} onRefresh={runOrchestrator} />
      </section>

      <FaultIntelSignalBoard run={state.runResult} signalCount={state.routeCount} onSelectPhase={() => {}} />
      <FaultIntelSignalTape run={state.runResult} maxSignals={12} />

      <section style={{ marginTop: 12 }}>
        <h3>Phase catalog</h3>
        <p style={{ marginBottom: 8, color: '#94a3b8' }}>
          route count: {state.routeCount}, planned phases: {phaseCatalog.length}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {phaseCatalog.map((route) => (
            <li key={route}>{route}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
