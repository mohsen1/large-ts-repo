import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useRecoveryCommandForgeWorkspace } from '../hooks/useRecoveryCommandForgeWorkspace';
import { CommandForgeDashboard } from '../components/recovery-command-forge/CommandForgeDashboard';
import { CommandForgePlanGraph } from '../components/recovery-command-forge/CommandForgePlanGraph';
import { CommandForgeSignals } from '../components/recovery-command-forge/CommandForgeSignals';
import { withBrand } from '@shared/core';
import type { ReadinessSloProfile, RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoverySignal, RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';

interface PageProps {
  readonly tenant: string;
}

const buildSignals = (tenant: string): readonly RecoverySignal[] =>
  Array.from({ length: 18 }).map((_, index) => ({
    id: `${tenant}-${index}`,
    source: index % 2 === 0 ? 'telemetry' : 'slo',
    severity: (index % 10) + 1,
    confidence: Number((0.2 + (index * 0.03)).toFixed(2)),
    detectedAt: new Date(Date.now() - index * 1000 * 45).toISOString(),
    details: {
      index,
      sourceHost: tenant,
    },
  }));

const buildRunSession = (tenant: string): RunSession => ({
  id: withBrand(`run-${tenant}-${Date.now()}`, 'RunSessionId'),
  runId: withBrand(`run-state-${tenant}`, 'RecoveryRunId'),
  ticketId: withBrand(`ticket-${tenant}`, 'RunTicketId'),
  planId: withBrand(`plan-${tenant}`, 'RunPlanId'),
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 6,
    maxRetries: 2,
    timeoutMinutes: 120,
    operatorApprovalRequired: true,
  },
  signals: [],
});

const buildPlanSnapshot = (tenant: string): RunPlanSnapshot => ({
  id: withBrand(`snapshot-${tenant}`, 'RunPlanId'),
  name: `Recovery plan ${tenant}`,
  program: {
    id: withBrand(`program-${tenant}`, 'RecoveryProgramId'),
    tenant: withBrand(tenant, 'TenantId'),
    service: withBrand('service', 'ServiceId'),
    name: 'Recovery command program',
    description: 'Simulation program for recovery command forge',
    priority: 'critical',
    mode: 'autonomous',
    window: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),
    },
    topology: {
      rootServices: ['recovery-service'],
      fallbackServices: ['incident-response'],
      immutableDependencies: [],
    },
    constraints: [],
    steps: [],
    owner: tenant,
    tags: ['recovery', 'forge'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as RunPlanSnapshot['program'],
  constraints: {
    maxParallelism: 6,
    maxRetries: 3,
    timeoutMinutes: 120,
    operatorApprovalRequired: true,
  },
  fingerprint: {
    tenant: withBrand(tenant, 'TenantId'),
    region: 'global',
    serviceFamily: 'platform',
    impactClass: 'application',
    estimatedRecoveryMinutes: 20,
  },
  effectiveAt: new Date().toISOString(),
});

const buildReadinessPlan = (tenant: string): RecoveryReadinessPlan => ({
  planId: withBrand(`readiness-${tenant}`, 'RecoveryReadinessPlanId'),
  runId: withBrand(`run-${tenant}`, 'ReadinessRunId'),
  title: `Readiness plan ${tenant}`,
  objective: 'availability',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'amber',
  metadata: {
    owner: 'recovery-console',
    tags: ['command-forge', 'console'],
    tenant,
  },
});

const slaProfile: ReadinessSloProfile = {
  profileId: withBrand('slo-profile', 'ReadinessSloProfileId'),
  name: 'Recovery command profile',
  targets: [
    {
      key: 'mttr',
      warningAt: 25,
      criticalAt: 100,
      unit: 'minutes',
    },
    {
      key: 'stability',
      warningAt: 75,
      criticalAt: 50,
      unit: 'score',
    },
  ],
  windowMinutes: 75,
};

export const RecoveryCommandForgePage = ({ tenant }: PageProps): ReactElement => {
  const [showDetails, setShowDetails] = useState(false);

  const session = useMemo(() => buildRunSession(tenant), [tenant]);
  const planSnapshot = useMemo(() => buildPlanSnapshot(tenant), [tenant]);
  const readinessPlan = useMemo(() => buildReadinessPlan(tenant), [tenant]);
  const signals = useMemo(() => buildSignals(tenant), [tenant]);

  const workspace = useRecoveryCommandForgeWorkspace({
    tenant,
    readinessPlan,
    session,
    planSnapshot,
    signals,
    slaProfile,
  });

  return (
    <main className="recovery-command-forge-page">
      <h1>Recovery Command Forge</h1>
      <p>{tenant}</p>
      <p>Nodes: {workspace.planNodes.length}</p>
      <p>Signals: {workspace.signalCount}</p>

      <div>
        <button type="button" onClick={workspace.run} disabled={workspace.state.busy}>
          {workspace.state.busy ? 'Running...' : 'Run forge simulation'}
        </button>
        <button type="button" onClick={workspace.reset}>
          Reset
        </button>
        <button type="button" onClick={() => setShowDetails((previous) => !previous)}>
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <CommandForgeDashboard workspaceState={workspace.state} />
      {showDetails ? (
        <>
          <CommandForgeSignals state={workspace.state} />
          {workspace.state.report ? <CommandForgePlanGraph topologies={workspace.state.report.topologies} /> : <p>No topology</p>}
        </>
      ) : null}
    </main>
  );
};
