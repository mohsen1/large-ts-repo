import { useMemo, useState, type ReactElement } from 'react';

import type { IncidentGraph, SimulationResult } from '@domain/recovery-incident-graph';
import { createPlan, simulateWithSeed } from '@domain/recovery-incident-graph';
import { computeEngineAnalytics, formatAnalytics } from '@service/recovery-incident-graph-engine';
import { runEngine, createEngineRuntimeState, controlEngine } from '@service/recovery-incident-graph-engine';

interface RecoveryIncidentGraphDashboardProps {
  readonly graph: IncidentGraph;
}

export const RecoveryIncidentGraphDashboard = ({ graph }: RecoveryIncidentGraphDashboardProps): ReactElement => {
  const [simulateCount, setSimulateCount] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const readinessTargets = graph.nodes.filter((node) => node.state === 'ready' || node.state === 'running').length;

  const runBatch = async () => {
    setIsRunning(true);
    try {
      const requests = Array.from({ length: Math.max(1, simulateCount) }).map((_, index) => {
        const requestId = `${graph.meta.id}-request-${index}`;
        const plan = createPlan(graph, {});
        return {
          requestId,
          context: {
            tenantId: graph.meta.tenantId,
            requestedBy: 'ui',
            graph,
            signals: [],
            planOverrides: {
              preferredOrdering: 'criticality-first' as const,
              profile: {
                id: plan.plan.id as any,
                tenantId: graph.meta.tenantId,
                profileName: 'ui',
                maxParallelism: 4,
                minReadinessWindowMinutes: 10,
                allowOverrides: true,
                allowReentrance: false,
              },
            },
          },
        };
      });

      const runtime = createEngineRuntimeState(requests[0]?.requestId ?? `${graph.meta.id}-fallback`);
      controlEngine(runtime.requestId, runtime, { requestId: runtime.requestId, action: 'resume', reason: 'manual-start' });

      const response = runEngine(requests[0]);
      const analytics = computeEngineAnalytics(response);
      setResult(response.simulation);

      // side effect for visibility and debugging
      // eslint-disable-next-line no-console
      console.log(formatAnalytics(analytics));
    } finally {
      setIsRunning(false);
    }
  };

  const syntheticSim = useMemo(() => {
    return simulateWithSeed({
      graph,
      signals: [],
      maxTicks: Math.max(4, simulateCount * 3),
      scenarioId: `${graph.meta.id}-ui`,
    });
  }, [graph, simulateCount]);

  const readinessText = `${((readinessTargets / Math.max(1, graph.nodes.length)) * 100).toFixed(1)}%`;

  return (
    <section aria-label="recovery-incident-graph-dashboard">
      <h2>Recovery Incident Graph Dashboard</h2>
      <p>
        Tenant: {graph.meta.tenantId} · Nodes: {graph.nodes.length} · Edges: {graph.edges.length}
      </p>
      <p>Ready/active share: {readinessText}</p>
      <label>
        Simulations
        <input
          type="number"
          min={1}
          max={12}
          value={simulateCount}
          onChange={(event) => setSimulateCount(Number(event.target.value))}
        />
      </label>
      <button type="button" onClick={runBatch} disabled={isRunning}>
        {isRunning ? 'Running...' : 'Run Engine Batch'}
      </button>
      <h3>Synthetic Snapshot</h3>
      <ul>
        <li>success={String(syntheticSim.success)}</li>
        <li>frames={syntheticSim.frames.length}</li>
        <li>downtime={syntheticSim.predictedDowntimeMinutes}m</li>
        <li>failed={syntheticSim.summary.failedNodeCount}</li>
      </ul>
      <h3>Latest Run</h3>
      {result ? (
        <ul>
          <li>result-success={String(result.success)}</li>
          <li>completed={result.summary.completedNodeCount}</li>
          <li>depth={result.maxDepth}</li>
        </ul>
      ) : (
        <p>no result yet</p>
      )}
    </section>
  );
};
