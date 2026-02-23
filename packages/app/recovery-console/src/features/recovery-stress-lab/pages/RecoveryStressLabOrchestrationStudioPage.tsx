import { useMemo, useState } from 'react';
import { createRunbookId, createStepId, createSignalId, createTenantId, createWorkloadId } from '@domain/recovery-stress-lab';
import { WorkloadTopology } from '@domain/recovery-stress-lab';
import { useRecoveryStressLab } from '../hooks/useRecoveryStressLab';
import { useRecoveryStressLabAnalytics } from '../hooks/useRecoveryStressLabAnalytics';
import { useStressLabRecommendations } from '../hooks/useStressLabRecommendations';
import { StressLabAnalyticsPanel } from '../components/StressLabAnalyticsPanel';
import { StressLabLifecycleTimeline } from '../components/StressLabLifecycleTimeline';
import { StressLabRunbookRanking } from '../components/StressLabRunbookRanking';

const studioTenantId = createTenantId('studio-tenant');

const sampleTopology: WorkloadTopology = {
  tenantId: studioTenantId,
  nodes: [
    {
      id: createWorkloadId('studio-workload-a'),
      name: 'api-gateway',
      ownerTeam: 'platform',
      criticality: 5,
      active: true,
    },
    {
      id: createWorkloadId('studio-workload-b'),
      name: 'transaction-service',
      ownerTeam: 'payments',
      criticality: 4,
      active: true,
    },
    {
      id: createWorkloadId('studio-workload-c'),
      name: 'ledger-collector',
      ownerTeam: 'risk',
      criticality: 3,
      active: true,
    },
  ],
  edges: [
    {
      from: createWorkloadId('studio-workload-a'),
      to: createWorkloadId('studio-workload-b'),
      coupling: 0.75,
      reason: 'gateway depends on transaction service',
    },
    {
      from: createWorkloadId('studio-workload-b'),
      to: createWorkloadId('studio-workload-c'),
      coupling: 0.56,
      reason: 'transactions write to ledger',
    },
  ],
};

export const RecoveryStressLabOrchestrationStudioPage = () => {
  const tenantId = createTenantId('studio-tenant');
  const {
    band,
    status,
    runbooks,
    signals,
    selectedSignals,
    plan,
    simulation,
    setBand,
    setRunbooks,
    setSignals,
    setSelectedSignalIds,
    buildPlan,
    run,
    runWithService,
  } = useRecoveryStressLab(tenantId);

  const [topologyReady, setTopologyReady] = useState(false);
  const analytics = useRecoveryStressLabAnalytics({
    tenantId,
    band,
    runbooks,
    targets: [],
    topology: topologyReady ? sampleTopology : { tenantId, nodes: [], edges: [] },
    signals,
    simulation,
    plan,
  });
  const recommendations = useStressLabRecommendations({
    tenantId,
    band,
    runbooks,
    plan,
    signals,
    simulation,
  });

  const metrics = useMemo(() => {
    return analytics.readiness.metrics.plan ? {
      nodes: sampleTopology.nodes.length,
      edges: sampleTopology.edges.length,
      issues: analytics.issueCount,
      warnings: analytics.warningCount,
      topCode: recommendations.topCode,
    } : null;
  }, [analytics.readiness.metrics.plan, analytics.issueCount, analytics.warningCount, recommendations.topCode]);

  const seedDemoData = () => {
    setRunbooks([
      {
        id: createRunbookId('studio-runbook-a'),
        tenantId,
        name: 'Studio Isolation Routine',
        description: 'Drills isolation between API and transaction service',
        steps: [
          {
            commandId: createStepId('studio-step-observe'),
            title: 'Observe gateway and queue pressure',
            phase: 'observe',
            estimatedMinutes: 15,
            prerequisites: [],
            requiredSignals: [createSignalId('studio-sig-1')],
          },
          {
            commandId: createStepId('studio-step-isolate'),
            title: 'Isolate transaction edge',
            phase: 'isolate',
            estimatedMinutes: 16,
            prerequisites: [createStepId('studio-step-observe')],
            requiredSignals: [createSignalId('studio-sig-1')],
          },
          {
            commandId: createStepId('studio-step-migrate'),
            title: 'Migrate API traffic',
            phase: 'migrate',
            estimatedMinutes: 20,
            prerequisites: [createStepId('studio-step-isolate')],
            requiredSignals: [createSignalId('studio-sig-2')],
          },
        ],
        ownerTeam: 'platform',
        cadence: { weekday: 2, windowStartMinute: 360, windowEndMinute: 480 },
      },
      {
        id: createRunbookId('studio-runbook-b'),
        tenantId,
        name: 'Studio Recovery Validate',
        description: 'Verify restore path and standby confidence',
        steps: [
          {
            commandId: createStepId('studio-step-verify'),
            title: 'Verify ledger catchup',
            phase: 'verify',
            estimatedMinutes: 24,
            prerequisites: [createStepId('studio-step-migrate')],
            requiredSignals: [createSignalId('studio-sig-2')],
          },
          {
            commandId: createStepId('studio-step-restore'),
            title: 'Restore steady-state traffic',
            phase: 'restore',
            estimatedMinutes: 23,
            prerequisites: [createStepId('studio-step-verify')],
            requiredSignals: [createSignalId('studio-sig-1')],
          },
        ],
        ownerTeam: 'payments',
        cadence: { weekday: 3, windowStartMinute: 600, windowEndMinute: 720 },
      },
    ]);
    setSignals([
      {
        id: createSignalId('studio-sig-1'),
        class: 'availability',
        severity: 'high',
        title: 'api latency increase',
        createdAt: new Date().toISOString(),
        metadata: { source: 'studio', domain: 'gateway' },
      },
      {
        id: createSignalId('studio-sig-2'),
        class: 'integrity',
        severity: 'critical',
        title: 'ledger heartbeat delay',
        createdAt: new Date().toISOString(),
        metadata: { source: 'studio', domain: 'ledger' },
      },
    ]);
    setSelectedSignalIds([createSignalId('studio-sig-1'), createSignalId('studio-sig-2')]);
    setTopologyReady(true);
  };

  return (
    <main>
      <h1>Recovery Stress Lab Orchestration Studio</h1>
      <p>{`Status: ${status}`}</p>
      <p>{`Selected signals: ${selectedSignals.length}`}</p>

      <label>
        Band:
        <select value={band} onChange={(event) => setBand(event.target.value as typeof band)}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </label>

      <div>
        <button type="button" onClick={seedDemoData}>
          Seed demo lab
        </button>
        <button type="button" onClick={buildPlan} disabled={status === 'planning'}>
          Build plan
        </button>
        <button type="button" onClick={run} disabled={status === 'simulating'}>
          Run simulation
        </button>
        <button type="button" onClick={runWithService}>
          Run orchestrator bootstrap
        </button>
      </div>

    <StressLabAnalyticsPanel report={recommendations} metrics={metrics} />
      <StressLabRunbookRanking
        ranking={analytics.runbookRanking}
        runbooks={runbooks}
        topology={topologyReady ? sampleTopology : null}
      />
      <StressLabLifecycleTimeline plan={plan} simulation={simulation} enabled={topologyReady} />

      <section>
        <h2>Signals</h2>
        <ul>
          {signals.map((signal) => (
            <li key={signal.id}>{`${signal.class} · ${signal.title} · ${signal.severity}`}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
