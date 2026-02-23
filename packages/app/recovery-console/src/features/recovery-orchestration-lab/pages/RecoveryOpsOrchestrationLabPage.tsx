import { useState } from 'react';
import { useRecoveryOpsOrchestrationLab } from '../hooks/useRecoveryOpsOrchestrationLab';
import { useRecoveryOpsOrchestrationLabState } from '../hooks/useRecoveryOpsOrchestrationLabState';
import { RecoveryOpsSurfaceCard } from '../components/RecoveryOpsSurfaceCard';

import { RecoveryOpsSurfaceTimeline as SurfaceTimeline } from '../components/RecoveryOpsSurfaceTimeline';
import { RecoveryOpsSurfaceRiskTable as SurfaceRiskTable } from '../components/RecoveryOpsSurfaceRiskTable';

export const RecoveryOpsOrchestrationLabPage = () => {
  const [tenantId, setTenantId] = useState('tenant-demo');
  const [scenarioId, setScenarioId] = useState('scenario-lab-01');

  const lab = useRecoveryOpsOrchestrationLab({ tenantId, scenarioId });
  const workspace = useRecoveryOpsOrchestrationLabState(tenantId, scenarioId);

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h2>Recovery Ops Orchestration Lab</h2>
        <p>{lab.summary}</p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>
          Tenant
          <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
        </label>
        <label>
          Scenario
          <input value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} />
        </label>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button
          type="button"
          onClick={() => {
            lab.runOrchestrate();
          }}
          disabled={lab.isLoading}
        >
          {lab.isLoading ? 'Running...' : 'Run orchestration simulation'}
        </button>
        <div>{workspace.surfaces.length} persisted surface(s)</div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        {workspace.surfaces.map((surface) => (
          <RecoveryOpsSurfaceCard
            key={surface.id}
            surface={surface}
            selected={workspace.selectedSurfaceId === surface.id}
            onSelect={() => {
              return;
            }}
          />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {lab.latest && (
          <>
            <SurfaceTimeline result={lab.latest} />
            <SurfaceRiskTable result={lab.latest} />
          </>
        )}
      </section>

      <section>
        <h4>Plan scores</h4>
        <ul>
          {lab.summaries.slice(0, 10).map((summary) => (
            <li key={summary.id}>
              {summary.id} - score {summary.score} - {summary.risk} - {summary.durationMinutes}m
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
