import type { ChangeEvent } from 'react';
import { useMemo } from 'react';
import { useRecoveryScenarioLabWorkspace } from '../hooks/useRecoveryScenarioLabWorkspace';
import { ScenarioExecutionRail } from '../components/ScenarioExecutionRail';
import { ScenarioRiskBoard } from '../components/ScenarioRiskBoard';
import { ScenarioWorkspaceHeader } from '../components/ScenarioWorkspaceHeader';

interface RecoveryScenarioLabPageProps {
  readonly tenantId: string;
  readonly incidentId: string;
}

export const RecoveryScenarioLabPage = ({ tenantId, incidentId }: RecoveryScenarioLabPageProps) => {
  const workspace = useRecoveryScenarioLabWorkspace({
    tenantId,
    incidentId,
  });

  const plans = useMemo(() => {
    return Array.from({ length: Math.max(1, workspace.candidateCount) }).map((_, index) => `${tenantId}:template:${index + 1}`);
  }, [tenantId, workspace.candidateCount]);

  return (
    <main style={{ padding: '1rem', color: '#e2e8f0', display: 'grid', gap: '1rem' }}>
      <ScenarioWorkspaceHeader
        workspace={workspace}
        onRefresh={workspace.clearSelection}
      />
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.5rem' }}>
          Template
          <select
            value={workspace.selectedTemplateId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => workspace.selectTemplate(event.target.value)}
            style={{ borderRadius: 6, width: 300 }}
          >
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
        <ScenarioRiskBoard
          workspace={workspace}
          onSelectTemplate={workspace.selectTemplate}
        />
        <ScenarioExecutionRail
          workspace={workspace}
          onRun={workspace.run}
        />
      </section>
      <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.75rem', background: '#0f172a' }}>
        <h2>Signal feed snapshot</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflow: 'auto' }}>
          {workspace.snapshots.slice(0, 10).map((snapshot) => (
            <li key={snapshot.id} style={{ display: 'grid', gap: '0.25rem', borderBottom: '1px solid #1e293b', padding: '0.4rem 0' }}>
              <strong>{snapshot.metric}</strong>
              <span>
                value {snapshot.value.toFixed(2)} · at {snapshot.observedAt}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
