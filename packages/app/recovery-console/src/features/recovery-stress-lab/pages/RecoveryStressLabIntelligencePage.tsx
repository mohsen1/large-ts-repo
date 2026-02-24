import { type ReactElement, useMemo, useState } from 'react';
import { useRecoveryStressLabIntelligence } from '../hooks/useRecoveryStressLabIntelligence';
import { StressLabIntelligencePanel } from '../components/StressLabIntelligencePanel';
import { StressLabForecastHeatmap } from '../components/StressLabForecastHeatmap';
import { StressLabSignalFlowGraph } from '../components/StressLabSignalFlowGraph';
import {
  type OrchestrationPlan,
  type RecoverySimulationResult,
  createTenantId,
  createRunbookId,
  createStepId,
  createSignalId,
  createWorkloadId,
} from '@domain/recovery-stress-lab';

const tenantId = createTenantId('tenant-intelligence-default');
const runbookId = createRunbookId('runbook-intelligence-default');
const blockedWorkloadId = createWorkloadId('workload-a');
const workloadPrimaryId = createWorkloadId('workload-a');
const workloadSecondaryId = createWorkloadId('workload-b');

const defaultPlan: OrchestrationPlan = {
  tenantId,
  scenarioName: 'intelligence-default',
  schedule: [],
  runbooks: [
    {
      id: runbookId,
      tenantId,
      name: 'default',
      description: 'default recovery stress plan',
      steps: [
        {
          commandId: createStepId('s1'),
          title: 'observe',
          phase: 'observe',
          estimatedMinutes: 10,
          prerequisites: [],
          requiredSignals: [createSignalId('sig-a')],
        },
        {
          commandId: createStepId('s2'),
          title: 'restore',
          phase: 'restore',
          estimatedMinutes: 12,
          prerequisites: [createStepId('s1')],
          requiredSignals: [createSignalId('sig-b')],
        },
      ],
      ownerTeam: 'intelligence-lab',
      cadence: { weekday: 1, windowStartMinute: 480, windowEndMinute: 620 },
    },
  ],
  dependencies: {
    nodes: [workloadPrimaryId, workloadSecondaryId],
    edges: [
      {
        from: workloadPrimaryId,
        to: workloadSecondaryId,
        weight: 0.86,
        payload: {
          fromCriticality: 5,
          toCriticality: 4,
        },
      },
    ],
  },
  estimatedCompletionMinutes: 32,
};

const defaultSimulation: RecoverySimulationResult = {
  tenantId,
  startedAt: new Date().toISOString(),
  endedAt: new Date(Date.now() + 90000).toISOString(),
  selectedRunbooks: [runbookId],
  ticks: [
    {
      timestamp: new Date().toISOString(),
      activeWorkloads: 2,
      blockedWorkloads: [blockedWorkloadId],
      confidence: 0.87,
    },
  ],
  riskScore: 0.42,
  slaCompliance: 0.91,
  notes: ['warm simulation'],
};

export const RecoveryStressLabIntelligencePage = (): ReactElement => {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const {
    status,
    summary,
    recommendations,
    error,
    load,
    buildSummary,
    topPriorityCount,
    phaseCount,
  } = useRecoveryStressLabIntelligence({
    tenantId: 'tenant-intelligence',
    runName: 'Stress Intelligence',
    maxRecommendations: 16,
    plan: defaultPlan,
    simulation: defaultSimulation,
  });

  const buildReport = async (): Promise<void> => {
    const built = await buildSummary();
    setReport(built);
  };

  const diagnosticsReport = useMemo(() => (summary ? 'ready' : 'not ready'), [summary]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 20 }}>
      <h1>Recovery Stress Lab Intelligence Workspace</h1>
      <p>
        A dedicated intelligence workbench for stress-lab orchestration, combining forecast generation,
        recommendation ranking, and signal-flow rendering.
      </p>

      <StressLabIntelligencePanel
        summary={summary}
        status={status}
        recommendations={recommendations}
        error={error}
        onRefresh={load}
        onExport={buildReport}
      />

      <StressLabSignalFlowGraph
        summary={summary}
        recommendations={recommendations}
        onHoverSignal={setHighlight}
      />
      <StressLabForecastHeatmap summary={summary} recommendations={recommendations} />

      <section style={{ display: 'grid', gap: 8 }}>
        <h3>Diagnostics</h3>
        <ul>
          <li>highlighted: {highlight ?? 'none'}</li>
          <li>top priority recommendations: {topPriorityCount}</li>
          <li>diagnostic report: {diagnosticsReport}</li>
          <li>report artifact: {report ?? 'not generated'}</li>
          <li>
            phases:{' '}
            {Object.entries(phaseCount)
              .map(([key, value]) => `${key}:${value}`)
              .join(', ')}
          </li>
        </ul>
      </section>
    </main>
  );
};

export default RecoveryStressLabIntelligencePage;
