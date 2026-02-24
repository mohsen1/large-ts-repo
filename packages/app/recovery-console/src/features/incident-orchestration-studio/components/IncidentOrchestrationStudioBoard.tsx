import { useMemo } from 'react';
import type { IncidentStudioWorkspace, UseIncidentOrchestrationStudioResult } from '../hooks/useIncidentOrchestrationStudio';

const severityPalette = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#0284c7',
  info: '#22c55e',
} as const;

interface IncidentOrchestrationStudioBoardProps extends Pick<UseIncidentOrchestrationStudioResult, 'workspace' | 'diagnosticsText' | 'runState'> {}

const Section = ({ title, children }: { readonly title: string; readonly children: React.ReactNode }) => (
  <section style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
    <h2 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h2>
    {children}
  </section>
);

export const IncidentOrchestrationStudioBoard = ({ workspace, diagnosticsText, runState }: IncidentOrchestrationStudioBoardProps) => {
  const policyLine = useMemo(() => {
    if (!workspace?.selectedPolicy) {
      return 'No policy selected';
    }
    return `policy ${workspace.selectedPolicy}`;
  }, [workspace]);

  const stateLine = useMemo(() => {
    if (runState.status === 'idle') return 'idle';
    if (runState.status === 'running') return 'running';
    if (runState.status === 'complete') return `complete: policy ${runState.output.policy.id}`;
    return `failed: ${runState.reason}`;
  }, [runState]);

  return (
    <main style={{ display: 'grid', gap: '1rem' }}>
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Incident Orchestration Studio</h1>
        <p style={{ margin: 0, color: '#94a3b8' }}>
          Tenant {workspace?.tenantId ?? 'unknown'} · State {stateLine} · {policyLine}
        </p>
      </header>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
        <Section title="Workspace">
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <p style={{ margin: 0 }}>Incident {workspace?.incidentId ?? 'none'}</p>
            <p style={{ margin: 0 }}>Policy approved: {workspace?.policyApproved ? 'yes' : 'no'}</p>
            <p style={{ margin: 0 }}>Candidates: {workspace?.snapshot?.candidates.length ?? 0}</p>
            <p style={{ margin: 0 }}>Signals: {workspace?.snapshot?.activeSignals ?? 0}</p>
          </div>
        </Section>
        <Section title="Telemetry">
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {workspace?.snapshot?.metrics.slice(0, 3).map((metric, index) => (
              <p key={`${metric.source}-${index}`} style={{ margin: 0 }}>
                {metric.name}: {metric.value}
                <span style={{ color: severityPalette.info, marginLeft: '0.4rem' }}>
                  {metric.source}
                </span>
              </p>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{diagnosticsText}</p>
        </Section>
      </div>
    </main>
  );
};
