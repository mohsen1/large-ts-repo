import { useEffect, useMemo, useState } from 'react';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';
import { ReadinessCommandAnalytics, ReadinessCommandMatrix, type FleetSearchInput } from '@service/recovery-readiness-orchestrator';
import type { ReadinessPolicy, ReadinessRunId } from '@domain/recovery-readiness';

export interface UseReadinessDeepDiveStateParams {
  readonly tenant: string;
  readonly policy: ReadinessPolicy;
  readonly refreshIntervalMs?: number;
}

export interface ReadinessDeepDiveRow {
  readonly runId: ReadinessRunId;
  readonly owner: string;
  readonly healthScore: number;
  readonly directivesAtRisk: number;
  readonly trendLabel: string;
  readonly anomalyWarnings: string[];
}

export interface UseReadinessDeepDiveStateResult {
  readonly loading: boolean;
  readonly summary: {
    readonly total: number;
    readonly averageHealth: number;
    readonly criticalRuns: number;
  };
  readonly rows: readonly ReadinessDeepDiveRow[];
  readonly topRuns: readonly ReadinessRunId[];
  readonly runIds: readonly ReadinessRunId[];
  readonly runs: readonly ReadinessReadModel[];
  readonly refresh: () => void;
}

export const useReadinessDeepDiveState = ({
  tenant,
  policy,
  refreshIntervalMs = 15000,
}: UseReadinessDeepDiveStateParams): UseReadinessDeepDiveStateResult => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<readonly ReadinessDeepDiveRow[]>([]);
  const [topRuns, setTopRuns] = useState<readonly ReadinessRunId[]>([]);
  const [summary, setSummary] = useState<{ total: number; averageHealth: number; criticalRuns: number }>({
    total: 0,
    averageHealth: 0,
    criticalRuns: 0,
  });
  const [runs, setRuns] = useState<readonly ReadinessReadModel[]>([]);
  const [repo] = useState<ReadinessRepository>(() => new MemoryReadinessRepository());
  const analytics = useMemo(() => new ReadinessCommandAnalytics({ policy, repo }), [policy, repo]);
  const matrix = useMemo(() => new ReadinessCommandMatrix({ policy, repo }), [policy, repo]);

  const compute = async () => {
    setLoading(true);
    try {
      const filter: FleetSearchInput = { tenant };
      const overview = await analytics.overview();
      const fleet = await analytics.metrics(filter);
      const matrixResult = await matrix.healthMatrix(filter);

      if (!overview.ok || !fleet.ok) {
        setRows([]);
        setTopRuns([]);
        setSummary({
          total: matrixResult.total,
          averageHealth: matrixResult.avgHealth,
          criticalRuns: matrixResult.criticalRuns,
        });
        return;
      }

      const runRows: ReadinessDeepDiveRow[] = fleet.value.map((metric, index) => ({
        runId: metric.runId,
        owner: metric.owner,
        healthScore: metric.score,
        directivesAtRisk: Math.round(metric.anomalyCount),
        trendLabel: index % 3 === 0 ? 'stable' : index % 2 === 0 ? 'improving' : 'degrading',
        anomalyWarnings: metric.signalDensity > 15 ? ['high-density', 'requires-check'] : ['normal'],
      }));
      const active = await repo.listActive();
      setRows(runRows);
      setRuns(active);
      setTopRuns(runRows
        .slice(0, 3)
        .map((entry) => entry.runId)
      );
      setSummary({
        total: fleet.value.length,
        averageHealth: runRows.length ? Number((runRows.reduce((sum, entry) => sum + entry.healthScore, 0) / runRows.length).toFixed(2)) : 0,
        criticalRuns: matrixResult.criticalRuns,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void compute();
    const handle = setInterval(() => {
      void compute();
    }, refreshIntervalMs);
    return () => clearInterval(handle);
  }, [refreshIntervalMs, tenant, policy.policyId]);

  const runIds = useMemo(() => {
    const seen = new Set<string>();
    const flattened = [...rows, ...rows.map((entry) => ({ ...entry, runId: entry.runId }))]
      .map((entry) => entry.runId)
      .filter((id) => {
        const key = `${id}`;
        const duplicate = seen.has(key);
        seen.add(key);
        return !duplicate;
      });
    return flattened;
  }, [rows]);

  const refresh = () => {
    void compute();
  };

  return {
    loading,
    summary: {
      total: summary.total,
      averageHealth: summary.averageHealth,
      criticalRuns: summary.criticalRuns,
    },
    rows,
    topRuns,
    runIds,
    runs,
    refresh,
  };
};
