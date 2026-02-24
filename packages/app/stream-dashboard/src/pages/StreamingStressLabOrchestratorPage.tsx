import { FormEvent, useCallback, useMemo, useState } from 'react';
import {
  runAdvancedWorkflowSession,
  buildRecoveryTargetsFromSignals,
} from '../services/stressLabAdvancedWorkflow';
import { useStressLabOrchestrator } from '../hooks/useStressLabOrchestrator';
import { StressLabWorkflowStageBoard, buildStageBoardEntries } from '../components/StressLabWorkflowStageBoard';
import { StressLabSignalsInspector, summarizeSignalBuckets } from '../components/StressLabSignalsInspector';
import {
  StressLabWorkflowRegistry,
  buildRegistryFromKinds,
  StressLabWorkflowRegistryCompact,
} from '../components/StressLabWorkflowRegistry';
import { buildDashboardModel } from '../services/stressLabAdvancedAdapter';
import {
  CommandRunbook,
  RecoverySignal,
  createTenantId,
} from '@domain/recovery-stress-lab';

const initialSignals: RecoverySignal[] = [];

const buildDemoSignals = (): RecoverySignal[] =>
  [
    {
      id: 'sig-avail-01' as any,
      class: 'availability',
      severity: 'high',
      title: 'Availability drop',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
    {
      id: 'sig-int-01' as any,
      class: 'integrity',
      severity: 'medium',
      title: 'Integrity drift',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  ];

const buildDemoRunbooks = (): CommandRunbook[] => [
  {
    id: 'rb-snapshot-01' as any,
    tenantId: createTenantId('tenant-1'),
    name: 'snapshot-runbook',
    description: 'capture recovery',
    steps: [],
    ownerTeam: 'platform',
    cadence: {
      weekday: 1,
      windowStartMinute: 10,
      windowEndMinute: 20,
    },
  },
];

const initialState = {
  tenantId: createTenantId('tenant-1'),
  runbooks: buildDemoRunbooks(),
  signals: initialSignals,
  targets: buildRecoveryTargetsFromSignals(createTenantId('tenant-1'), buildDemoSignals()),
  requestedBand: 'high' as const,
  mode: 'adaptive' as const,
};

export const StreamingStressLabOrchestratorPage = () => {
  const [tenant, setTenant] = useState<string>(String(initialState.tenantId));
  const [band, setBand] = useState< 'low' | 'medium' | 'high' | 'critical' >('high');
  const [mode, setMode] = useState<'conservative' | 'adaptive' | 'agile'>('adaptive');
  const [signals, setSignals] = useState<RecoverySignal[]>(buildDemoSignals());
  const [runbooks] = useState<CommandRunbook[]>(buildDemoRunbooks());
  const [registryKinds, setRegistryKinds] = useState<string[]>(['stress-lab/input-collector', 'stress-lab/finalizer']);
  const { state, run, isBusy, canRun, reset } = useStressLabOrchestrator();

  const workspaceTargets = useMemo(
    () => buildRecoveryTargetsFromSignals(createTenantId(tenant), signals),
    [signals, tenant],
  );

  const registry = useMemo(() => buildRegistryFromKinds(registryKinds), [registryKinds]);
  const canLaunch = canRun({ ...initialState, tenantId: createTenantId(tenant), signals, runbooks, targets: workspaceTargets, requestedBand: band, mode });

  const buckets = useMemo(() => summarizeSignalBuckets(signals), [signals]);

  const onToggleKind = useCallback((kind: string) => {
    setRegistryKinds((current) =>
      current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : [...current, kind],
    );
  }, []);

  const onRun = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!canLaunch || isBusy) {
        return;
      }
      void run({
        tenantId: createTenantId(tenant),
        runbooks,
        signals,
        targets: workspaceTargets,
        requestedBand: band,
        mode,
      });
    },
    [canLaunch, isBusy, run, runbooks, signals, tenant, workspaceTargets, band, mode],
  );

  const onSignalsRefresh = useCallback(() => {
    setSignals((current) => [...current, ...buildDemoSignals()]);
  }, []);

  return (
    <main>
      <h1>Streaming Stress Lab Orchestrator</h1>
      <form onSubmit={onRun}>
        <label htmlFor="tenant">Tenant</label>
        <input id="tenant" value={tenant} onChange={(event) => setTenant(event.target.value)} />
        <label htmlFor="mode">Mode</label>
        <select id="mode" value={mode} onChange={(event) => setMode(event.target.value as never)}>
          <option value="conservative">conservative</option>
          <option value="adaptive">adaptive</option>
          <option value="agile">agile</option>
        </select>
        <label htmlFor="band">Band</label>
        <select id="band" value={band} onChange={(event) => setBand(event.target.value as never)}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="submit" disabled={!canLaunch || isBusy}>
          {isBusy ? 'Running...' : 'Run Advanced Workflow'}
        </button>
      </form>
      <button type="button" onClick={onSignalsRefresh}>
        Append Demo Signals
      </button>
      <button type="button" onClick={reset}>
        Reset
      </button>
      <section>
        <StressLabSignalsInspector title="Signal Inspector" signals={signals} />
        <StressLabWorkflowRegistry registry={registry} activeKinds={registryKinds} onToggle={onToggleKind} />
        <div>
          {buckets.map((entry) => (
            <span key={entry.className} style={{ marginRight: 8 }}>
              {entry.className}: {entry.count}
            </span>
          ))}
        </div>
      </section>
      <section>
        <p>Status: {state.status}</p>
        <p>Run Count: {state.runCount}</p>
        <p>Topology: {state.topology.nodes} nodes / {state.topology.edges} edges</p>
        {state.latestResult && (
          <>
            <StressLabWorkflowStageBoard
              title={`Run ${state.latestResult.runId}`}
              entries={buildStageBoardEntries(state.latestResult)}
            />
            <pre>{JSON.stringify(buildDashboardModel(state.latestResult.result), null, 2)}</pre>
            <StressLabWorkflowRegistryCompact
              activeKinds={state.latestResult.result.workspace.signals.map((signal) => String(signal.class))}
            />
          </>
        )}
      </section>
      <section>
        {state.queue.length > 0 && (
          <ol>
            {state.queue.map((runId) => (
              <li key={runId}>{runId}</li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
};
