import { useMemo } from 'react';
import { withBrand } from '@shared/core';
import type { RunSession } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { useRecoveryPolicyConsole } from '../hooks/useRecoveryPolicyConsole';
import { PolicyCompliancePanel } from '../components/PolicyCompliancePanel';
import { PolicyDecisionBoard } from '../components/PolicyDecisionBoard';

const tenant = 'global';

const readinessPlan: RecoveryReadinessPlan = {
  planId: withBrand('plan:audit', 'RecoveryReadinessPlanId'),
  runId: withBrand('runid:audit', 'ReadinessRunId'),
  title: 'Audit readiness',
  objective: 'full-audit',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'green',
  metadata: {
    owner: 'audit',
    tags: ['audit'],
    tenant,
  },
};

const session: RunSession = {
  id: withBrand('session:audit', 'RunSessionId'),
  runId: withBrand('run:audit', 'RecoveryRunId'),
  ticketId: withBrand('ticket:audit', 'RunTicketId'),
  planId: withBrand('planid:audit', 'RunPlanId'),
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 1,
    maxRetries: 1,
    timeoutMinutes: 25,
    operatorApprovalRequired: false,
  },
  signals: [],
};

const program: RecoveryProgram = {
  id: withBrand('program:audit', 'RecoveryProgramId'),
  tenant: withBrand(tenant, 'TenantId'),
  service: withBrand('audit', 'ServiceId'),
  name: 'Audit program',
  description: 'Policy audit and trace visibility',
  priority: 'silver',
  mode: 'defensive',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 360_000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['audit'],
    fallbackServices: [],
    immutableDependencies: [['audit', 'logger']],
  },
  constraints: [],
  steps: [],
  owner: 'audit',
  tags: ['audit'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const RecoveryPolicyAuditPage = () => {
  const audit = useRecoveryPolicyConsole({
    tenant,
    runId: 'policy-audit-run',
    session,
    program,
    readinessPlan,
    signals: [],
  });

  const auditHints = useMemo(
    () => audit.records.map((record, index) => `${index + 1}. ${record.state}-${record.summary}`),
    [audit.records],
  );

  return (
    <main className="policy-audit-page">
      <h2>Policy audit and compliance</h2>
      <p>Records: {audit.records.length}</p>
      <p>Latest at: {audit.lastSummary}</p>
      <section>
        <h3>Audit hints</h3>
        <ol>
          {auditHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      </section>
      <section>
        <PolicyDecisionBoard records={audit.records} onRefresh={audit.reset} />
      </section>
      <section>
        <PolicyCompliancePanel timeline={audit.timeline} onClear={audit.reset} />
      </section>
      <button type="button" onClick={audit.runBatch}>
        Run audit policy check
      </button>
    </main>
  );
};
