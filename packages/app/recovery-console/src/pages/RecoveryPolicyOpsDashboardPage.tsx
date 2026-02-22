import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { RecoveryOperationsCommandCenter } from '../components/RecoveryOperationsCommandCenter';
import { PolicyDecisionBoard } from '../components/PolicyDecisionBoard';
import { PolicyPipelineTimeline } from '../components/PolicyPipelineTimeline';
import { PolicyCompliancePanel } from '../components/PolicyCompliancePanel';
import { useRecoveryPolicyConsole } from '../hooks/useRecoveryPolicyConsole';
import type { RunSession } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

const tenant = 'global';

const program: RecoveryProgram = {
  id: withBrand('program:policy-ui', 'RecoveryProgramId'),
  tenant: withBrand(tenant, 'TenantId'),
  service: withBrand('recovery', 'ServiceId'),
  name: 'Policy console program',
  description: 'Policy evaluation for policy engine stress coverage',
  priority: 'platinum',
  mode: 'defensive',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['api', 'worker'],
    fallbackServices: ['fallback'],
    immutableDependencies: [['api', 'db'], ['worker', 'queue']],
  },
  constraints: [],
  steps: [],
  owner: 'console',
  tags: ['console', 'policy'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const readinessPlan: RecoveryReadinessPlan = {
  planId: withBrand('plan:policy', 'RecoveryReadinessPlanId'),
  runId: withBrand('runid:policy', 'ReadinessRunId'),
  title: 'Policy readiness plan',
  objective: 'policy confidence',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'green',
  metadata: {
    owner: 'policy-console',
    tags: ['policy', 'console'],
    tenant,
  },
};

const fakeSession: RunSession = {
  id: withBrand('session:policy', 'RunSessionId'),
  runId: withBrand('run:policy', 'RecoveryRunId'),
  ticketId: withBrand('ticket:policy', 'RunTicketId'),
  planId: withBrand('planid:policy', 'RunPlanId'),
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 2,
    maxRetries: 3,
    timeoutMinutes: 60,
    operatorApprovalRequired: false,
  },
  signals: [],
};

export const RecoveryPolicyOpsDashboardPage = () => {
  const [view, setView] = useState<'live' | 'history'>('live');

  const hook = useRecoveryPolicyConsole({
    tenant,
    runId: 'policy-run-dashboard',
    session: fakeSession,
    program,
    readinessPlan,
    signals: [],
  });

  const selectedTimeline = useMemo(() => hook.timeline, [hook.timeline]);

  return (
    <main className="policy-ops-dashboard">
      <h2>Recovery policy operations dashboard</h2>
      <nav>
        <button type="button" onClick={() => setView('live')}>
          Live
        </button>
        <button type="button" onClick={() => setView('history')}>
          History
        </button>
      </nav>
      <p>Tenant: {tenant}</p>
      <p>Total decisions: {hook.decisionCount}</p>
      <p>Last summary: {hook.lastSummary}</p>
      <p>Simulation mode: {hook.simulateOnly ? 'running' : 'idle'}</p>
      <div className="policy-toolbar">
        <button type="button" onClick={hook.runBatch} disabled={hook.running}>
          Run policy engine check
        </button>
        <button type="button" onClick={hook.runSimulation}>
          Run simulation
        </button>
        <button type="button" onClick={hook.reset}>
          Reset
        </button>
      </div>
      {view === 'live' ? (
        <>
          <PolicyDecisionBoard records={hook.records} onRefresh={hook.reset} />
          <PolicyPipelineTimeline timelines={selectedTimeline} />
        </>
      ) : (
        <section>
          <h3>Replay view</h3>
          <p>Replay and audit data can be reconstructed from in-memory log.</p>
          <PolicyCompliancePanel timeline={selectedTimeline} onClear={hook.reset} />
        </section>
      )}
      <section>
        <h3>Command center snapshot</h3>
        <RecoveryOperationsCommandCenter />
      </section>
    </main>
  );
};
