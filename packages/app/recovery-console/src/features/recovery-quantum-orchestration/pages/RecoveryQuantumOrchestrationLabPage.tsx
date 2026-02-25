import { useState } from 'react';
import { useRecoveryQuantumOrchestration } from '../hooks/useRecoveryQuantumOrchestration';
import { QuantumSignalGrid } from '../components/QuantumSignalGrid';
import { QuantumPolicyDeck } from '../components/QuantumPolicyDeck';
import { QuantumTimeline } from '../components/QuantumTimeline';
import type { QuantumTenantId } from '@domain/recovery-quantum-orchestration';

export const RecoveryQuantumOrchestrationLabPage = () => {
  const [tenant] = useState<QuantumTenantId>(() => 'tenant:alpha' as QuantumTenantId);
  const {
    dashboard,
    policies,
    signals,
    runtimePlan,
    loadError,
    queryStats,
    refresh,
    refreshSignals,
  } = useRecoveryQuantumOrchestration(tenant);

  return (
    <main className="recovery-quantum-orchestration-page">
      <h2>Quantum orchestration lab</h2>
      <article>
        <h3>Dashboard</h3>
        <p>Tenant: {dashboard?.tenant ?? tenant}</p>
        <p>Status: {dashboard?.status ?? 'idle'}</p>
        <p>Policies: {dashboard?.policyCount ?? 0}</p>
        <p>Signals: {dashboard?.signalCount ?? 0}</p>
        {loadError ? <p role="alert">Error: {loadError}</p> : null}
      </article>
      <article>
        <h3>Plan signals</h3>
        <button type="button" onClick={refresh}>
          Reload
        </button>
        <button type="button" onClick={() => void refreshSignals('critical')}>
          Filter critical
        </button>
      </article>
      {queryStats ? (
        <article>
          <h3>Query stats</h3>
          <p>Total: {queryStats.total}</p>
          <p>Matched: {queryStats.matched}</p>
          <p>Skipped: {queryStats.skipped}</p>
        </article>
      ) : null}
      <section>
        <QuantumPolicyDeck policies={policies} />
      </section>
      <section>
        <QuantumSignalGrid signals={signals} />
      </section>
      <section>
        <QuantumTimeline plan={runtimePlan} />
      </section>
    </main>
  );
};
