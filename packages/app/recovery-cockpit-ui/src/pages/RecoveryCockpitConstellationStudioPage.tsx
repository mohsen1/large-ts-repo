import { FC, useMemo } from 'react';
import { RecoveryPlan, type PlanId } from '@domain/recovery-cockpit-models';
import {
  ConstellationMode,
  ConstellationTopology,
  ConstellationNodeId,
} from '@domain/recovery-cockpit-constellation-core';
import { useConstellationOrchestrator } from '../hooks/useConstellationOrchestrator';
import { useConstellationRunHistory } from '../hooks/useConstellationRunHistory';
import { ConstellationControlCenter } from '../components/constellation/ConstellationControlCenter';
import { ConstellationRunConsole } from '../components/constellation/ConstellationRunConsole';
import { ConstellationTopologyPanel } from '../components/constellation/ConstellationTopologyPanel';
import { ConstellationSignalFeed } from '../components/constellation/ConstellationSignalFeed';

const PLACEHOLDER_PLAN: RecoveryPlan = {
  planId: 'constellation:standby' as PlanId,
  labels: {
    short: 'standby',
    long: 'placeholder topology',
    emoji: '🛡️',
    labels: ['standby'],
  },
  mode: 'manual',
  title: 'standby',
  description: 'warmup constellation for immediate simulation',
  actions: [],
  audit: [],
  slaMinutes: 60,
  isSafe: true,
  version: 1 as never,
  effectiveAt: new Date().toISOString() as never,
};

const fallbackNodes = [
  {
    nodeId: 'init-node' as ConstellationNodeId,
    label: 'constellation:init',
    stage: 'bootstrap' as const,
    actionCount: 1,
    criticality: 1,
  },
];

const fallbackTopology: ConstellationTopology = { nodes: fallbackNodes, edges: [] };

export const RecoveryCockpitConstellationStudioPage: FC<{
  readonly plans?: readonly RecoveryPlan[];
  readonly preferredMode?: ConstellationMode;
  readonly topology?: ConstellationTopology;
}> = ({ plans = [], preferredMode = 'analysis', topology }) => {
  const workspacePlan = plans[0] ?? PLACEHOLDER_PLAN;
  const runtimeHook = useConstellationOrchestrator({
    plan: workspacePlan,
    constellationId: 'playground',
    runMode: preferredMode,
    maxPathLength: 8,
  });

  const history = useConstellationRunHistory(runtimeHook.history, { limit: 6, direction: 'desc' });
  const planRows = useMemo(
    () => (plans.length ? plans : [runtimeHook.runtime?.snapshot?.plan ?? workspacePlan]),
    [plans, runtimeHook.runtime?.snapshot?.plan, workspacePlan],
  );
  const activeTopology = topology ?? fallbackTopology;

  return (
    <main style={{ padding: 20, fontFamily: 'Inter, ui-sans-serif, system-ui', display: 'grid', gap: 16 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h1>Constellation Studio</h1>
        <p>Model-driven recovery runs with deterministic orchestration pathways.</p>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <ConstellationControlCenter
          mode={preferredMode}
          total={planRows.length}
          loading={runtimeHook.loading}
          stages={runtimeHook.pipeline.stages.map((entry) => entry.stage)}
          onStart={() => void runtimeHook.start(preferredMode)}
          error={runtimeHook.error}
          onClearError={() => history.clear()}
        />
        <ConstellationRunConsole runtime={runtimeHook.runtime ?? null} />
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <ConstellationTopologyPanel snapshot={runtimeHook.runtime?.snapshot ?? null} />
        <ConstellationSignalFeed runtime={runtimeHook.runtime ?? null} />
      </section>

      <section>
        <h3>Recent runs</h3>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={history.search}
            onChange={(event) => history.setFilter(event.target.value)}
            placeholder="filter by run id"
          />
          <button type="button" onClick={history.clear} style={{ marginLeft: 8 }}>
            reset
          </button>
        </div>
        <ul>
          {history.results.length ? (
            history.results.map((entry) => (
              <li key={entry.response.requestId} style={{ paddingBottom: 8 }}>
                <strong>{entry.response.requestId}</strong> · {entry.response.status}
                <button type="button" onClick={() => void runtimeHook.inspect(entry.response.requestId)} style={{ marginLeft: 8 }}>
                  inspect
                </button>
              </li>
            ))
          ) : (
            <li>No runs tracked.</li>
          )}
        </ul>
      </section>

      <section>
        <h3>Topology source</h3>
        <p>{activeTopology.nodes.length} nodes and {activeTopology.edges.length} edges from plan context.</p>
      </section>

      {planRows.map((plan) => (
        <PlanBadge key={plan.planId} plan={plan} />
      ))}
    </main>
  );
};

const PlanBadge: FC<{ plan: RecoveryPlan }> = ({ plan }) => (
  <article style={{ border: '1px solid #2a2a32', padding: 12, borderRadius: 10, marginBottom: 12 }}>
    <h3>{plan.labels.short}</h3>
    <p>{plan.labels.long}</p>
    <p>
      <strong>Actions</strong>: {plan.actions.length} · <strong>Mode</strong>: {plan.mode}
    </p>
  </article>
);
