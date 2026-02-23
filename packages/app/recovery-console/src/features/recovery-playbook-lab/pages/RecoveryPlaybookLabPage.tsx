import { useMemo } from 'react';
import { useRecoveryPlaybookLabWorkspace } from '../hooks/useRecoveryPlaybookLabWorkspace';
import { RecoveryPlaybookLabDashboard } from '../components/RecoveryPlaybookLabDashboard';
import { RecoveryPlaybookLabTimeline } from '../components/RecoveryPlaybookLabTimeline';
import { RecoveryPlaybookLabSignals } from '../components/RecoveryPlaybookLabSignals';
import { withBrand } from '@shared/core';
import { seedRecoveryPlaybookRepository } from '@data/recovery-playbook-store/seed';
import { InMemoryRecoveryPlaybookRepository } from '@data/recovery-playbook-store/memory-repository';
import type { PlaybookLabWorkspaceInput } from '@service/recovery-playbook-lab-orchestrator';

const repository = new InMemoryRecoveryPlaybookRepository();
void seedRecoveryPlaybookRepository(repository);

const workspaceInput = (tenant: string): PlaybookLabWorkspaceInput => ({
  tenantId: withBrand(tenant, 'TenantId'),
  owner: 'recovery-console',
  lens: 'recovery',
  window: {
    fromUtc: new Date().toISOString(),
    toUtc: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  },
  maxDurationMinutes: 240,
  maxCandidates: 24,
  searchQuery: {
    tenantId: withBrand(tenant, 'TenantId'),
    limit: 24,
  },
});

export const RecoveryPlaybookLabPage = () => {
  const input = useMemo(() => workspaceInput('tenant-platform'), []);
  const {
    state,
    runPlan,
    toggleLens,
    refresh,
    statusSummary,
  } = useRecoveryPlaybookLabWorkspace({
    repository,
    input,
  });

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      gap: '0.9rem',
      padding: '1rem',
      color: '#e2e8f0',
      background: 'linear-gradient(180deg, #020617, #0f172a 20%, #1e293b)',
    }}>
      <section style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Recovery Playbook Lab</h1>
        <span style={{ color: '#94a3b8' }}>{statusSummary}</span>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <RecoveryPlaybookLabDashboard
          title={`Tenant ${state.route.tenant}`}
          candidates={state.candidates}
          telemetry={state.telemetry}
          onRun={runPlan}
        />
        <RecoveryPlaybookLabTimeline telemetry={state.telemetry} />
      </section>

      <RecoveryPlaybookLabSignals
        lanes={['recovery', 'performance', 'stability', 'compliance']}
        refresh={() => {
          refresh();
        }}
      />

      <section style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
        <button onClick={() => toggleLens('recovery')} type="button">Recovery lens</button>
        <button onClick={() => toggleLens('performance')} type="button">Performance lens</button>
        <button onClick={() => toggleLens('stability')} type="button">Stability lens</button>
        <button onClick={() => toggleLens('compliance')} type="button">Compliance lens</button>
      </section>
    </main>
  );
};

export default RecoveryPlaybookLabPage;
