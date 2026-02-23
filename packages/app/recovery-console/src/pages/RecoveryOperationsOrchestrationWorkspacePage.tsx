import { useMemo, type ReactElement } from 'react';
import type { RecoveryOperationsEnvelope, RecoverySignal, RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';
import { useRecoveryOperationsCommandCenter } from '../hooks/useRecoveryOperationsCommandCenter';
import { RecoveryOperationsOrchestrationDashboard } from '../components/RecoveryOperationsOrchestrationDashboard';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

interface Props {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly session: RunSession;
  readonly plan: RunPlanSnapshot;
}

const buildMockSignals = (tenant: string): readonly RecoveryOperationsEnvelope<RecoverySignal>[] => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    eventId: `${tenant}-signal-${index}`,
    tenant: withBrand(tenant, 'TenantId'),
    payload: {
      id: `signal-${index}`,
      source: `source-${index % 3}`,
      severity: (index % 10) + 1,
      confidence: Number((0.35 + index * 0.06).toFixed(2)),
      detectedAt: new Date(Date.now() - index * 30_000).toISOString(),
      details: { index },
    },
    createdAt: new Date().toISOString(),
  }));

  return entries;
};

export const RecoveryOperationsOrchestrationWorkspacePage = ({ tenant, readinessPlan, session, plan }: Props): ReactElement => {
  const workspace = useRecoveryOperationsCommandCenter();
  const repository = useMemo(() => new InMemoryRecoveryOperationsRepository(), []);

  const signals = useMemo(() => buildMockSignals(tenant), [tenant]);

  return (
    <main className="recovery-operations-orchestration-workspace-page">
      <h1>Recovery command orchestration</h1>
      <p>{tenant}</p>
      <p>Owner: {readinessPlan.metadata.owner}</p>
      <p>Workspace state: {workspace.state.busy ? 'busy' : 'ready'}</p>
      <p>Signals from telemetry: {signals.length}</p>
      <RecoveryOperationsOrchestrationDashboard
        tenant={tenant}
        session={session}
        plan={plan}
        readinessPlan={readinessPlan}
        signals={signals}
      />
      <section className="telemetry-inspector">
        <h2>Telemetry snapshots</h2>
        <pre>{workspace.state.lastForecast}</pre>
        <button
          type="button"
          onClick={() => {
            void repository.loadSessionByRunId(String(session.runId));
          }}
        >
          Refresh
        </button>
      </section>
    </main>
  );
};
