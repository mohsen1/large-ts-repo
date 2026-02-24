import { useMemo, useState } from 'react';
import {
  type RecoverySignal,
  type WorkloadTopology,
  type TenantId,
  type SeverityBand,
  createSignalId,
  createTenantId,
  createWorkloadId,
} from '@domain/recovery-stress-lab';
import { useRecoveryStressLab } from '../hooks/useRecoveryStressLab';
import { StressLabEventFeed } from '../components/stress-lab/StressLabEventFeed';
import { StressLabPolicyPanel } from '../components/stress-lab/StressLabPolicyPanel';
import { StressLabRunDeck } from '../components/stress-lab/StressLabRunDeck';
import { StressLabTopologyRadar } from '../components/stress-lab/StressLabTopologyRadar';
import { StressLabSignalTimeline } from '../components/stress-lab/StressLabSignalTimeline';
import { StressLabScenarioPanel } from '../components/stress-lab/StressLabScenarioPanel';

const defaultTopology: WorkloadTopology = {
  tenantId: createTenantId('tenant-a'),
  nodes: [
    {
      id: createWorkloadId('workload-core'),
      name: 'core-services',
      ownerTeam: 'platform',
      criticality: 5,
      active: true,
    },
    {
      id: createWorkloadId('workload-edge'),
      name: 'edge-services',
      ownerTeam: 'platform',
      criticality: 4,
      active: true,
    },
  ],
  edges: [
    {
      from: createWorkloadId('workload-core'),
      to: createWorkloadId('workload-edge'),
      coupling: 0.78,
      reason: 'latency path',
    },
  ],
};

const defaultSignals = [
  {
    id: createSignalId('signal-default-1'),
    class: 'availability',
    severity: 'high',
    title: 'replica lag increase',
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    metadata: { source: 'edge', tenant: 'tenant-a' },
  },
  {
    id: createSignalId('signal-default-2'),
    class: 'performance',
    severity: 'medium',
    title: 'p99 latency drift',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    metadata: { source: 'api', tenant: 'tenant-a' },
  },
] as const satisfies readonly RecoverySignal[];

const defaultRunbooks = ['runbook-failover', 'runbook-throttle', 'runbook-isolate'];

const prettyReportSummary = (report: { readonly sessionId: string; readonly stepCount: number; readonly warnings: readonly string[] } | null): string => {
  if (!report) {
    return 'no report yet';
  }
  return `${report.sessionId} · steps=${report.stepCount} · warnings=${report.warnings.length}`;
};

export const RecoveryStressLabStudioPage = ({
  tenantId = createTenantId('tenant-a'),
}: {
  readonly tenantId?: TenantId;
} = {}) => {
  const {
    state,
    runOnce,
    updateTopology,
    updateSignals,
    updateBand,
    updateRunbooks,
    clearError,
    outputSignals,
    outputWarnings,
  } = useRecoveryStressLab(defaultTopology, defaultSignals);

  const [selectedRunbooks, setSelectedRunbooks] = useState<readonly string[]>(defaultRunbooks);

  const submit = async (payload: {
    topology: WorkloadTopology;
    signals: readonly RecoverySignal[];
    runbookIds: readonly string[];
    band: SeverityBand;
  }) => {
    updateTopology(payload.topology);
    updateSignals(payload.signals);
    updateRunbooks(payload.runbookIds);
    updateBand(payload.band);
    await runOnce(payload);
  };

  const reportSummary = useMemo(() => prettyReportSummary(state.lastOutcome?.report ?? null), [state.lastOutcome?.report]);

  return (
    <main className="recovery-stress-lab-studio">
      <h1>Recovery Stress Lab Studio</h1>
      <p>Tenant {tenantId}</p>
      <p>{reportSummary}</p>
      <StressLabRunDeck topology={defaultTopology} signals={defaultSignals} band={'medium'} onSubmit={submit} />

      <section className="stress-lab-actions">
        <button type="button" onClick={() => void submit({ topology: defaultTopology, signals: defaultSignals, runbookIds: selectedRunbooks, band: 'high' })}>
          Run quick
        </button>
        <button type="button" onClick={clearError}>
          Clear Error
        </button>
        <button type="button" onClick={() => setSelectedRunbooks((current) => [...current, `runbook-${current.length + 1}`])}>
          Add runbook
        </button>
      </section>

      {state.error ? <p className="error">{state.error}</p> : null}

      <StressLabPolicyPanel report={state.lastOutcome?.report ?? null} />
      <StressLabEventFeed report={state.lastOutcome?.report ?? null} />
      <StressLabScenarioPanel report={state.lastOutcome?.report ?? null} />
      <StressLabTopologyRadar topology={defaultTopology} selectedNodeIds={defaultTopology.nodes.map((node) => node.id)} />
      <StressLabSignalTimeline signals={defaultSignals} active={outputSignals} />

      <section className="run-metadata">
        <h3>Output Signals</h3>
        <p>{outputSignals.length} signal ids captured</p>
        <ul>
          {outputSignals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
        <h3>Output Warnings</h3>
        <ul>
          {outputWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
