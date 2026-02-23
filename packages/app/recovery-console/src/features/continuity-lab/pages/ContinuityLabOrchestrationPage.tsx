import { useMemo } from 'react';
import { useContinuityLabCoordinator, ContinuityLabCoordinatorBadge } from '../hooks/useContinuityLabCoordinator';
import { ContinuityLabCommandCard } from '../components/ContinuityLabCommandCard';
import { ContinuityLabMatrix } from '../components/ContinuityLabMatrix';
import { ContinuityReadinessPulse } from '../components/ContinuityReadinessPulse';
import { ContinuityControlContext, ScenarioStage } from '@domain/recovery-continuity-lab-core';

const demoContext: ContinuityControlContext = {
  tenantId: 'tenant-fidelity',
  topologyNodes: [
    {
      nodeId: 'n1',
      region: 'us-west',
      tier: 'control',
      status: 'healthy' as const,
      affinity: ['edge-1', 'edge-2'],
    },
    {
      nodeId: 'n2',
      region: 'us-east',
      tier: 'data',
      status: 'degraded' as const,
      affinity: ['edge-2'],
    },
    {
      nodeId: 'n3',
      region: 'eu-west',
      tier: 'api',
      status: 'critical' as const,
      affinity: ['edge-3'],
    },
  ],
  topologyEdges: [
    { from: 'n1', to: 'n2', strength: 0.75, directed: true },
    { from: 'n2', to: 'n3', strength: 0.33, directed: true },
    { from: 'n1', to: 'n3', strength: 0.22, directed: false },
  ],
  policy: {
    policyId: 'policy-fidelity',
    name: 'continuity-lab-default',
    appliesTo: ['sensitivity-1', 'sensitivity-2'],
    maxConcurrency: 8,
    riskTolerance: 'amber' as const,
  },
  constraints: [
    {
      constraintId: 'c-1',
      label: 'minimum-ready-coverage',
      description: 'Coverage should remain above 60% in execution stage',
      maxRisk: 0.55,
      minCoverage: 0.45,
      enforceDuringStages: ['planning', 'execution'] as ReadonlyArray<ScenarioStage>,
    },
  ],
};

export const ContinuityLabOrchestrationPage = () => {
  const { loading, runAll, reset, plans, runHistory, runSummary } = useContinuityLabCoordinator({
    tenantId: 'tenant-fidelity',
    context: demoContext,
  });

  const latestMap = useMemo(() => {
    const lookup = new Map<string, (typeof runHistory)[number]>();
    for (const run of runHistory) {
      lookup.set(run.planId, run);
    }
    return lookup;
  }, [runHistory]);

  return (
    <main style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
      <h1>Continuity lab orchestrator</h1>
      <p style={{ color: '#94a3b8' }}>This page simulates recovery continuity plans and renders policy-ready diagnostics.</p>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="button" onClick={() => void runAll()} disabled={loading}>
          {loading ? 'Running lab' : 'Run continuity suite'}
        </button>
        <button type="button" onClick={reset}>
          Reset run history
        </button>
        <ContinuityLabCoordinatorBadge>{`${plans.length} plans`}</ContinuityLabCoordinatorBadge>
      </div>

      <section style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
        {plans.map((plan) => (
          <ContinuityLabCommandCard key={plan.planId} plan={plan} outcome={latestMap.get(plan.planId)} />
        ))}
      </section>

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
        <ContinuityLabMatrix plans={plans} />
        <ContinuityReadinessPulse runs={runHistory} />
      </div>

      <section style={{ border: '1px dashed #334155', borderRadius: 12, padding: '0.75rem' }}>
        <h2 style={{ marginTop: 0 }}>Latest diagnostics</h2>
        <p>{runSummary}</p>
      </section>
    </main>
  );
};
