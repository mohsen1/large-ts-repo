import { useEffect, useMemo, useState } from 'react';
import type { ReadinessPolicy } from '@domain/recovery-readiness';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';
import { RecoveryReadinessOrchestrator } from '@service/recovery-readiness-orchestrator';
import { buildReadinessDigest, buildWindowDigest, buildSignalDensityTimeline } from '@data/recovery-readiness-store';
import { rankModelsByWindowDensity, summarizeOrchestratorState } from '@service/recovery-readiness-orchestrator';

interface TrendlineOptions {
  policy: ReadinessPolicy;
  tenant: string;
}

export interface TrendlinePoint {
  runId: string;
  at: string;
  score: number;
}

export interface ReadinessTrendlineState {
  loading: boolean;
  points: readonly TrendlinePoint[];
  topRunId?: string;
  scoreMean: number;
  trendDirection: 'up' | 'down' | 'flat';
}

export const useReadinessTrendline = ({ policy, tenant }: TrendlineOptions): ReadinessTrendlineState => {
  const [repo] = useState<ReadinessRepository>(() => new MemoryReadinessRepository());
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<readonly TrendlinePoint[]>([]);
  const [topRunId, setTopRunId] = useState<string | undefined>(undefined);
  const [scoreMean, setScoreMean] = useState(0);

  useEffect(() => {
    const orchestrator = new RecoveryReadinessOrchestrator({ repo, policy });
    void (async () => {
      setLoading(true);
      const all = await repo.listActive();
      const tenantRuns = all.filter((run) => run.plan.metadata.owner.includes(tenant));
      const digest = buildReadinessDigest(tenantRuns);
      const windows = buildWindowDigest(tenantRuns);
      const state = summarizeOrchestratorState(tenantRuns);
      const timeline = buildSignalDensityTimeline(tenantRuns);
      const ranked = rankModelsByWindowDensity(tenantRuns);

      const mapped = windows.map((window, index) => ({
        runId: window.runId,
        at: new Date().toISOString(),
        score: (window.activeDirectives + window.criticality) * (index + 1),
      }));
      const rankedPoint = ranked[0];
      const combined = [...mapped, ...digest.recentSignals.map((signal) => ({ runId: signal.split(':')[0], at: new Date().toISOString(), score: signal.length }))];
      setPoints(combined.sort((left, right) => right.score - left.score).slice(0, 20));
      setTopRunId(digest.topRunId ?? rankedPoint?.runId);
      setScoreMean(
        state.meanSignalDensity +
          Number((timeline.reduce((sum, point) => sum + point.signals, 0) / Math.max(1, timeline.length)).toFixed(2)),
      );
      await orchestrator.status({
        command: 'list',
        requestedBy: tenant,
        correlationId: tenant,
      });
      setLoading(false);
    })();
  }, [repo, policy, tenant]);

  const trendDirection = useMemo(() => {
    if (points.length < 2) {
      return 'flat';
    }
    const first = points[0]?.score ?? 0;
    const last = points[points.length - 1]?.score ?? 0;
    if (last - first > 0.5) return 'up';
    if (first - last > 0.5) return 'down';
    return 'flat';
  }, [points]);

  return {
    loading,
    points,
    topRunId,
    scoreMean,
    trendDirection,
  };
};
