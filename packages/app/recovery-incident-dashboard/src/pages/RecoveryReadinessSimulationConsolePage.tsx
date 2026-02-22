import { useMemo } from 'react';
import {
  useReadinessSimulationConsole,
} from '../hooks/useReadinessSimulationConsole';
import { ReadinessSimulationTimeline } from '../components/readiness-simulation/ReadinessSimulationTimeline';
import { ReadinessSimulationTile } from '../components/readiness-simulation/ReadinessSimulationTile';
import { ReadinessConstraintInspector } from '../components/readiness-simulation/ReadinessConstraintInspector';
import { withBrand } from '@shared/core';
import type {
  ReadinessPolicy,
  RecoveryReadinessPlanDraft,
  ReadinessSignal,
} from '@domain/recovery-readiness';

const policy: ReadinessPolicy = {
  policyId: 'recovery-readiness-console-default',
  name: 'recovery-readiness-console-default',
  constraints: {
    key: 'console',
    minWindowMinutes: 1,
    maxWindowMinutes: 120,
    minTargetCoveragePct: 10,
    forbidParallelity: false,
  },
  allowedRegions: new Set(['us-east-1']),
  blockedSignalSources: ['manual-check'],
};

const draft: RecoveryReadinessPlanDraft = {
  runId: withBrand('run-from-console', 'ReadinessRunId'),
  title: 'Readiness simulation from console',
  objective: 'validate readiness simulation orchestration',
  owner: 'platform',
  targetIds: [withBrand('target-api', 'RecoveryTargetId'), withBrand('target-db', 'RecoveryTargetId')],
  directiveIds: [withBrand('dir-heat', 'ReadinessDirectiveId')],
};

const signals: ReadinessSignal[] = [
  {
    signalId: withBrand('sig-1', 'ReadinessSignalId'),
    runId: withBrand('run-from-console', 'ReadinessRunId'),
    targetId: draft.targetIds[0],
    source: 'telemetry',
    name: 'CPU saturation spike',
    severity: 'high',
    capturedAt: '2025-01-01T00:01:00.000Z',
    details: { metric: 'cpu' },
  },
  {
    signalId: withBrand('sig-2', 'ReadinessSignalId'),
    runId: withBrand('run-from-console', 'ReadinessRunId'),
    targetId: draft.targetIds[1],
    source: 'synthetic',
    name: 'Synthetic failover path',
    severity: 'critical',
    capturedAt: '2025-01-01T00:02:00.000Z',
    details: { synthetic: true },
  },
];

export const RecoveryReadinessSimulationConsolePage = () => {
  const {
    state,
    activeRunId,
    controls,
    launch,
    step,
    cancel,
    summary,
    history,
  } = useReadinessSimulationConsole({
    tenant: 'global',
    policy,
    draft,
    signals,
  });

  const summaryText = useMemo(
    () => `history=${history.length} active=${activeRunId ?? 'none'} avgSeverity=${summary.avgSeverity.toFixed(2)} totalSignals=${summary.totalSignals}`,
    [history.length, activeRunId, summary.avgSeverity, summary.totalSignals],
  );

  if (!state) {
    return (
      <main className="readiness-simulation-console-page">
        <h1>Readiness Simulation Console</h1>
        <p>{summaryText}</p>
        <button onClick={() => void launch()}>Launch</button>
      </main>
    );
  }

  return (
    <main className="readiness-simulation-console-page">
      <h1>Readiness Simulation Console</h1>
      <p>{summaryText}</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <section style={{ flex: 2 }}>
          <ReadinessSimulationTile state={state} />
        </section>
        <section style={{ flex: 1 }}>
          <ReadinessConstraintInspector state={state} />
        </section>
      </div>
      <ReadinessSimulationTimeline points={state.projection} windowMinutes={60} />
      <div className="simulation-controls">
        <button disabled={!controls.canStart} onClick={() => void launch()}>
          Launch
        </button>
        <button disabled={!controls.canStep} onClick={() => void step()}>
          Step
        </button>
        <button disabled={!controls.canCancel} onClick={cancel}>
          Cancel
        </button>
      </div>
    </main>
  );
};
