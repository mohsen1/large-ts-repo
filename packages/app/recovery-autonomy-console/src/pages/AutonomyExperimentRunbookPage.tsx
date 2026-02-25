import { useMemo, useState } from 'react';
import { useAutonomyExperimentPlanner } from '../hooks/useAutonomyExperimentPlanner';
import { AutonomyExperimentWorkbench } from '../components/AutonomyExperimentWorkbench';
import { ExperimentTimeline } from '../components/ExperimentTimeline';
import { createPayloadTemplate, makePlanId, type ExperimentPlan, makeTenantId, type SignalChannel } from '@domain/recovery-autonomy-experiment';
import { withBrand } from '@shared/core';

const toLabel = (value: number): string => `${Math.round(value)} / 100`;

const annotatePlan = <T extends { graph: readonly unknown[]; sequence: readonly unknown[] }>(
  plan: T,
  activePhase: string,
): T => ({
  ...plan,
  graph: plan.graph.filter((entry: any) => entry.phase === activePhase),
});

export const AutonomyExperimentRunbookPage = ({ tenantId, graphId }: { tenantId: string; graphId: string }) => {
  const tenant = makeTenantId(tenantId);
  const { plan, planIntent, loading, diagnostics } = useAutonomyExperimentPlanner({
    tenantId,
    context: {
      tenantLabel: `tenant:${tenantId}`,
      namespace: `autonomy:${tenantId}`,
      activePhases: ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'],
      signal: graphId as SignalChannel,
      issuer: withBrand(tenantId, 'ExperimentIssuer'),
    },
    payload: {
      strategy: 'runbook',
      horizonMinutes: 120,
    },
  });

  const phases = useMemo(() => plan?.sequence ?? [], [plan?.sequence]);
  const [selected, setSelected] = useState(0);

  const activePhase = phases.at(selected) ?? 'prepare';
  const activePlan = useMemo<ExperimentPlan | undefined>(() => {
    if (!plan) {
      return undefined;
    }

    return {
      ...plan,
      planId: makePlanId(tenant),
      graph: plan.graph.map((node) => ({
        ...node,
        metadata: node.metadata,
      })),
    } as ExperimentPlan;
  }, [plan, tenant]);

  const filteredPlan = useMemo(() => (activePlan ? annotatePlan(activePlan, activePhase) : undefined), [activePlan, activePhase]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <h1>Autonomy Experiment Runbook</h1>
      <section>
        <label>Active phase index</label>
        <input
          type="range"
          min={0}
          max={Math.max(0, phases.length - 1)}
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
        />
        <p>{activePhase}</p>
      </section>

      <section>
        <p>Diagnostics: {diagnostics.length}</p>
        <ExperimentTimeline plan={filteredPlan} activePhase={activePhase} />
      </section>

      <section>
        <AutonomyExperimentWorkbench tenantId={tenantId} plan={filteredPlan}>
          <p>intent: {planIntent.intent.runId}</p>
          <p>payload score target: {toLabel(planIntent.payload.horizonMinutes)}</p>
          <p>
            plan payload:&nbsp;
            {JSON.stringify(planIntent.payload.metadata, null, 2)}
          </p>
        </AutonomyExperimentWorkbench>
      </section>

      {loading ? <p>Loading runbook…</p> : null}
    </main>
  );
};
