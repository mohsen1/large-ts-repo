import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DashboardSignal,
  ForecastPlan,
  WorkloadOrchestrator,
  OrchestratorMode,
} from '@service/recovery-workload-orchestrator';
import { createWorkloadOrchestrator } from '@service/recovery-workload-orchestrator';
import { serializeWorkloadId, type WorkloadSnapshot } from '@domain/recovery-workload-intelligence';
import { createInMemoryWorkloadRepository } from '@data/recovery-workload-store';
import type { WorkloadDependencyGraph, WorkloadUnitId } from '@domain/recovery-workload-intelligence';
import type { WorkloadRepository } from '@data/recovery-workload-store';

export interface WorkloadNodeRow {
  readonly id: string;
  readonly name: string;
  readonly risk: number;
  readonly state: 'ok' | 'warning' | 'critical';
}

const toRiskState = (risk: number): WorkloadNodeRow['state'] => {
  if (risk >= 0.65) {
    return 'critical';
  }
  if (risk >= 0.35) {
    return 'warning';
  }
  return 'ok';
};

const buildDemoSnapshots = (nodeId: WorkloadUnitId): WorkloadSnapshot[] => {
  const now = Date.now();
  const values = [35, 42, 58, 62, 71, 65, 74, 91, 84, 52, 46, 60, 77, 84];
  return values.map((value, index) => ({
    nodeId,
    timestamp: new Date(now - index * 8_000).toISOString(),
    cpuUtilization: value,
    iopsUtilization: value * 0.8,
    errorRate: value * 0.6,
    throughput: Math.max(1000, 2000 - value * 20),
  }));
};

const buildGraphSeed = (): WorkloadDependencyGraph => ({
  nodes: [
    {
      id: serializeWorkloadId('node', 'api-gateway-1'),
      name: 'api-gateway-1',
      team: 'core',
      region: 'us-east-1',
      primaryDependencies: [],
      criticality: 4,
      targetSlaMinutes: 10,
    },
    {
      id: serializeWorkloadId('node', 'billing-engine'),
      name: 'billing-engine',
      team: 'finance',
      region: 'us-east-1',
      primaryDependencies: ['api-gateway-1' as WorkloadUnitId],
      criticality: 5,
      targetSlaMinutes: 15,
    },
    {
      id: serializeWorkloadId('node', 'replay-worker'),
      name: 'replay-worker',
      team: 'streaming',
      region: 'us-west-2',
      primaryDependencies: ['api-gateway-1' as WorkloadUnitId],
      criticality: 3,
      targetSlaMinutes: 8,
    },
  ],
  edges: [
    {
      parent: serializeWorkloadId('node', 'api-gateway-1'),
      child: serializeWorkloadId('node', 'billing-engine'),
      relationship: 'hard',
      latencyMs: 5,
    },
    {
      parent: serializeWorkloadId('node', 'api-gateway-1'),
      child: serializeWorkloadId('node', 'replay-worker'),
      relationship: 'soft',
      latencyMs: 12,
    },
  ],
});

const buildSeedRepository = async (): Promise<WorkloadRepository> => {
  const repository = createInMemoryWorkloadRepository();
  const graph = buildGraphSeed();
  const nodes = graph.nodes.map((node) => ({
    node,
    snapshots: buildDemoSnapshots(node.id),
    forecastHistory: [],
  }));

  await Promise.all(nodes.map((entry) => repository.upsert(entry)));
  return repository;
};

export const useWorkloadForecast = (mode: OrchestratorMode) => {
  const [signal, setSignal] = useState<DashboardSignal>({ views: [], trend: [] });
  const [plans, setPlans] = useState<readonly ForecastPlan[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [orchestrator, setOrchestrator] = useState<WorkloadOrchestrator | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const repository = await buildSeedRepository();
      const engine = createWorkloadOrchestrator({
        repository,
        graph: buildGraphSeed(),
        mode,
      });

      if (!mounted) {
        return;
      }
      setOrchestrator(engine);
      setLoading(true);
      const latest = await engine.summary();
      const result = await engine.evaluate();

      if (!mounted) {
        return;
      }
      setSignal(latest);

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setPlans(result.value.planGroups);
      setLoading(false);
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [mode]);

  const rows = useMemo(
    () =>
      signal.views.map((entry) => ({
        id: entry.nodeId,
        name: entry.nodeName,
        risk: Math.min(1, entry.riskSignal),
        state: toRiskState(entry.riskSignal),
      } as WorkloadNodeRow)),
    [signal.views],
  );

  const runPlan = useCallback(async (incidentId: string): Promise<string | undefined> => {
    if (!orchestrator) {
      setError('orchestrator not initialized');
      return undefined;
    }

    const result = await orchestrator.executePlan(incidentId);
    if (!result.ok) {
      setError(result.error);
      return undefined;
    }

    return result.value;
  }, [orchestrator]);

  return {
    signal,
    plans,
    rows,
    loading,
    error,
    runPlan,
  };
};
