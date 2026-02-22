import { useCallback, useMemo, useState } from 'react';
import { useRecoveryFusion } from '../hooks/useRecoveryFusion';
import { FusionCommandRail } from '../components/fusion/FusionCommandRail';
import { FusionSignalFeed } from '../components/fusion/FusionSignalFeed';
import { FusionWaveMatrix } from '../components/fusion/FusionWaveMatrix';
import type { FusionWave, FusionSignal } from '@domain/recovery-fusion-intelligence';
import { analyzeTopology, buildDependencyOrder, type FusionTopology } from '@domain/recovery-fusion-intelligence';

const sampleWaves = (): FusionWave[] => {
  const now = Date.now();
  return [
    {
      id: 'wave-01',
      planId: 'plan-recovery' as any,
      runId: 'run-01' as any,
      state: 'warming',
      windowStart: new Date(now).toISOString(),
      windowEnd: new Date(now + 60_000).toISOString(),
      commands: [
        {
          id: 'command-01',
          waveId: 'wave-01',
          stepKey: 'route-health-check',
          action: 'start',
          actor: 'recovery-ops',
          requestedAt: new Date().toISOString(),
          rationale: 'boot wave 01',
        },
      ],
      readinessSignals: [],
      budget: {
        maxParallelism: 1,
        maxRetries: 2,
        timeoutMinutes: 45,
        operatorApprovalRequired: false,
      },
      riskBand: 'green',
      score: 0.72,
      metadata: {
        createdBy: 'scheduler',
        priority: 65,
        confidence: 0.82,
        ownerTeam: 'sre',
      },
    },
    {
      id: 'wave-02',
      planId: 'plan-recovery' as any,
      runId: 'run-01' as any,
      state: 'idle',
      windowStart: new Date(now + 60_000).toISOString(),
      windowEnd: new Date(now + 120_000).toISOString(),
      commands: [
        {
          id: 'command-02',
          waveId: 'wave-02',
          stepKey: 'validate-rehearsal',
          action: 'start',
          actor: 'recovery-ops',
          requestedAt: new Date().toISOString(),
          rationale: 'verify dependencies',
        },
      ],
      readinessSignals: [],
      budget: {
        maxParallelism: 2,
        maxRetries: 1,
        timeoutMinutes: 30,
        operatorApprovalRequired: true,
      },
      riskBand: 'amber',
      score: 0.58,
      metadata: {
        createdBy: 'scheduler',
        priority: 75,
        confidence: 0.61,
        ownerTeam: 'sre',
      },
    },
  ];
};

const seedSignals = (): FusionSignal[] => [
  {
    id: 'signal-1',
    runId: 'run-01' as any,
    incidentId: 'incident-recovery-1' as any,
    source: 'telemetry',
    severity: 0.89,
    confidence: 0.71,
    observedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    details: { source: 'ui-seed', lane: 'api' },
    tags: ['latency', 'api'],
    payload: {
      latencyP95: 250,
      region: 'us-east-1',
    },
  },
  {
    id: 'signal-2',
    runId: 'run-01' as any,
    incidentId: 'incident-recovery-1' as any,
    source: 'checks',
    severity: 0.52,
    confidence: 0.91,
    observedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    details: { source: 'ui-seed', lane: 'database' },
    tags: ['capacity', 'db'],
    payload: {
      timeoutRate: 0.09,
      region: 'us-east-1',
    },
  },
];

const topology: FusionTopology = {
  nodes: [
    {
      id: 'wave-01',
      label: 'warmup',
      weight: 0.8,
      parents: [],
      children: ['wave-02'],
    },
    {
      id: 'wave-02',
      label: 'verify',
      weight: 0.6,
      parents: ['wave-01'],
      children: [],
    },
  ],
  edges: [
    {
      from: 'wave-01',
      to: 'wave-02',
      latencyMs: 1200,
      riskPenalty: 0.4,
    },
  ],
};

const analyze = analyzeTopology(topology);

export const RecoveryFusionOrchestrationPage = () => {
  const { state, actions, summary, tenant } = useRecoveryFusion({
    tenant: 'tenant-01',
    zone: 'us-east-1',
    owner: 'dashboard-ops',
  });
  const [runId, setRunId] = useState('run-01');
  const [selectedWaveId, setSelectedWaveId] = useState<string | undefined>(undefined);
  const [filterSource, setFilterSource] = useState<string | undefined>(undefined);

  const waves = useMemo<readonly FusionWave[]>(() => {
    if (state.waves.length === 0) {
      return sampleWaves();
    }
    return state.waves;
  }, [state.waves]);

  const signals = useMemo<readonly FusionSignal[]>(() => {
    if (state.signals.length === 0) {
      return seedSignals();
    }
    return state.signals.filter((signal) =>
      filterSource ? signal.source === filterSource : true,
    );
  }, [filterSource, state.signals]);

  const startRun = useCallback(async () => {
    await actions.run(runId, waves);
  }, [actions, runId, waves]);

  const sendCommand = useCallback((command: string, waveId: string) => {
    void actions.command({
      runId: runId as any,
      targetWaveId: waveId,
      command: command as 'start' | 'pause' | 'resume' | 'abort',
      reason: `operator:${command}:${waveId}`,
    });
  }, [actions, runId]);

  return (
    <main className="recovery-fusion-page">
      <h1>Recovery Fusion Orchestration</h1>
      <section className="recovery-fusion-meta">
        <p>Status: {state.status}</p>
        <p>Tenant: {tenant ?? 'tenant-01'}</p>
        <p>Topology diameter: {analyze.diameter}</p>
        <p>Topology density: {analyze.density.toFixed(2)}</p>
        <p>Centrality: {analyze.centralityHotspots.join(', ')}</p>
        <p>Dependency order: {buildDependencyOrder(topology).join(' -> ')}</p>
      </section>

      <section className="recovery-fusion-controls">
        <label>
          Run ID
          <input value={runId} onChange={(event) => setRunId(event.target.value)} />
        </label>
        <button type="button" onClick={startRun}>
          Run Fusion Plan
        </button>
        <button type="button" onClick={() => actions.refresh(runId as any)}>
          Refresh Plan Cache
        </button>
        <button type="button" onClick={() => setFilterSource(undefined)}>
          Clear Signal Filter
        </button>
      </section>

      <FusionWaveMatrix
        waves={waves}
        signals={signals}
        onSelectWave={(waveId) => setSelectedWaveId(waveId)}
      />

      <FusionCommandRail
        waves={waves}
        selectedWaveId={selectedWaveId}
        onRunCommand={sendCommand}
      />

      <FusionSignalFeed
        signals={signals}
        selectedWaveId={selectedWaveId}
        onFilter={setFilterSource}
      />

      <section className="recovery-fusion-summary">
        <h2>Recent summaries</h2>
        {summary.length === 0 ? <p>No summaries yet</p> : null}
        {summary.map((entry) => (
          <article key={`${entry.runId}:${entry.planId}`}>
            <header>{entry.planId}</header>
            <p>Run: {entry.runId}</p>
            <p>Waves: {entry.waveCount}</p>
            <p>Signals: {entry.signalCount}</p>
            <p>Accepted: {entry.accepted ? 'yes' : 'no'}</p>
            <p>Updated: {entry.lastUpdatedAt}</p>
          </article>
        ))}
      </section>

      {state.errors.length > 0 ? (
        <section className="recovery-fusion-errors">
          <h2>Errors</h2>
          <ul>
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
};
