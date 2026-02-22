import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import type { TimelineSignal } from '../components/RecoveryOperationsTimeline';
import type { RunSession, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { useRecoveryPolicyConsole } from '../hooks/useRecoveryPolicyConsole';
import { RecoveryOperationsTimeline } from '../components/RecoveryOperationsTimeline';

const tenant = 'global';

const fakeSession: RunSession = {
  id: withBrand('session:sig', 'RunSessionId'),
  runId: withBrand('run:sig', 'RecoveryRunId'),
  ticketId: withBrand('ticket:sig', 'RunTicketId'),
  planId: withBrand('planid:sig', 'RunPlanId'),
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 1,
    maxRetries: 1,
    timeoutMinutes: 30,
    operatorApprovalRequired: false,
  },
  signals: [],
};

const program: RecoveryProgram = {
  id: withBrand('program:sig', 'RecoveryProgramId'),
  tenant: withBrand(tenant, 'TenantId'),
  service: withBrand('policy-signal', 'ServiceId'),
  name: 'Signal stream policy',
  description: 'Policy simulation over synthetic signals',
  priority: 'gold',
  mode: 'defensive',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['ingress'],
    fallbackServices: ['fallback'],
    immutableDependencies: [['ingress', 'cdn']],
  },
  constraints: [],
  steps: [],
  owner: 'policy-signal',
  tags: ['signal', 'policy'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const readinessPlan: RecoveryReadinessPlan = {
  planId: withBrand('plan:sig', 'RecoveryReadinessPlanId'),
  runId: withBrand('runid:sig', 'ReadinessRunId'),
  title: 'Signal readiness',
  objective: 'signal-driven policy',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'amber',
  metadata: {
    owner: 'signal-console',
    tags: ['signals'],
    tenant,
  },
};

const fakeSignals: RecoverySignal[] = [
  {
    id: 'signal-1',
    source: 'telemetry',
    severity: 7,
    confidence: 0.7,
    detectedAt: new Date().toISOString(),
    details: { lane: 'blue', synthetic: true },
  },
  {
    id: 'signal-2',
    source: 'telemetry',
    severity: 9,
    confidence: 0.92,
    detectedAt: new Date(Date.now() - 30_000).toISOString(),
    details: { lane: 'red', latency: 3000 },
  },
];

export const RecoveryPolicySignalsPage = () => {
  const [signals, setSignals] = useState<RecoverySignal[]>(fakeSignals);
  const [selectedSignal, setSelectedSignal] = useState<string>(fakeSignals[0]?.id ?? 'signal-1');

  const timelineSignals = useMemo<readonly TimelineSignal[]>(
    () =>
      signals.map((signal, index) => ({
        id: signal.id,
        severity: signal.severity,
        state: index % 2 === 0 ? 'pending' : 'running',
      })),
    [signals],
  );

  const selected = useMemo(
    () => signals.find((signal) => signal.id === selectedSignal),
    [signals, selectedSignal],
  );

  const engine = useRecoveryPolicyConsole({
    tenant,
    runId: 'policy-signals-run',
    session: fakeSession,
    program,
    readinessPlan,
    signals,
  });

  const pushSynthetic = () => {
    const next: RecoverySignal = {
      id: `signal-${Date.now()}`,
      source: 'synthetic',
      severity: 3 + Math.round(Math.random() * 6),
      confidence: Number((0.45 + Math.random() * 0.5).toFixed(2)),
      detectedAt: new Date().toISOString(),
      details: { source: 'ui', synthetic: true },
    };
    setSignals((previous) => [...previous, next]);
  };

  return (
    <main className="policy-signals-page">
      <h2>Policy signal stream</h2>
      <p>Signal count: {signals.length}</p>
      <p>Selected signal: {selected?.id ?? 'none'}</p>
      <div>
        <button type="button" onClick={pushSynthetic}>
          Add synthetic signal
        </button>
        <button type="button" onClick={engine.runSimulation}>
          Simulate
        </button>
      </div>
      <section>
        {signals.map((signal) => (
          <label key={signal.id}>
            <input
              type="radio"
              name="signal"
              checked={signal.id === selectedSignal}
              onChange={() => setSelectedSignal(signal.id)}
            />
            {signal.id} severity={signal.severity} confidence={signal.confidence}
          </label>
        ))}
      </section>
      <section>
        {selected && (
          <article>
            <h3>Selected signal details</h3>
            <pre>{JSON.stringify(selected, null, 2)}</pre>
          </article>
        )}
      </section>
      <section>
        <h3>Signal-driven timeline</h3>
        <RecoveryOperationsTimeline tenant={tenant} signals={timelineSignals} />
      </section>
    </main>
  );
};
