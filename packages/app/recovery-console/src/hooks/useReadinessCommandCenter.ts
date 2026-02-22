import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ReadinessPolicy, ReadinessSignal, RecoveryReadinessPlanDraft } from '@domain/recovery-readiness';
import { MemoryReadinessRepository, type ReadinessRepository, type ReadinessReadModel } from '@data/recovery-readiness-store';
import { queryByTenant, queryTimeline } from '@data/recovery-readiness-store';
import { digestModelReadiness } from '@data/recovery-readiness-store';
import { buildAdviceMap } from '@service/recovery-readiness-orchestrator';
import { buildStreamDigest } from '@service/recovery-readiness-orchestrator';
import { summarizeByOwner } from '@data/recovery-readiness-store';
import { RecoveryReadinessOrchestrator, type RecoveryRunnerOptions } from '@service/recovery-readiness-orchestrator';

export interface ReadinessCommandCenterState {
  readonly loading: boolean;
  readonly runs: readonly ReadinessReadModel[];
  readonly activeRunIds: readonly ReadinessReadModel['plan']['runId'][];
  readonly summaries: readonly {
    readonly runId: string;
    readonly signalDensity: number;
    readonly topOwner: string;
  }[];
  readonly streamId: string | undefined;
  readonly warningCount: number;
  readonly timelineLength: number;
}

export interface ReadinessCommandCenterOptions {
  readonly tenant: string;
  readonly planPolicy: ReadinessPolicy;
}

export const useReadinessCommandCenter = ({ tenant, planPolicy }: ReadinessCommandCenterOptions): ReadinessCommandCenterState => {
  const [repo] = useState<ReadinessRepository>(() => new MemoryReadinessRepository());
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<readonly ReadinessReadModel[]>([]);
  const [streamId, setStreamId] = useState<string | undefined>(undefined);

  const orchestrator = useMemo(
    () =>
      new RecoveryReadinessOrchestrator({
        repo,
        policy: planPolicy,
      }),
    [repo, planPolicy],
  );

  const hydrateState = useCallback(async () => {
    const active = await repo.listActive();
    setRuns(active);
    const summary = buildStreamDigest(active);
    setStreamId(summary.streamId);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void hydrateState();
  }, [hydrateState]);

  const summaries = useMemo(() => {
    const indexed = summarizeByOwner([...runs]);
    const byTenant = queryByTenant([...runs], tenant, {
      tenant,
      includeLowConfidence: true,
    });
    const advice = buildAdviceMap(runs);
    const timeline = queryTimeline(runs);

    const mapped = runs.map((run, index) => {
      const digest = digestModelReadiness(run);
      const owner = indexed.get(run.plan.metadata.owner) ?? 'unowned';
      const adviceMatch = advice.byRun[index]?.recommendation ?? 'observe';
      const density = digest.totalSignals > 0 ? byTenant[index]?.signalDensity ?? 0 : 0;
      return {
        runId: run.plan.runId,
        signalDensity: density,
        topOwner: `${owner}:${adviceMatch}`,
      };
    });

    const fallbackRun = byTenant[0];
    if (fallbackRun && !mapped.find((entry) => entry.runId === fallbackRun.runId)) {
      mapped.push({ runId: fallbackRun.runId, signalDensity: fallbackRun.signalDensity, topOwner: `${fallbackRun.runId}:fallback` });
    }

    return mapped;
  }, [runs, tenant]);

  const warningCount = useMemo(() => summaries.filter((item) => item.signalDensity > 10).length, [summaries]);
  const timelineLength = useMemo(() => queryTimeline(runs).length, [runs]);

  const bootstrapDraft = useCallback(async (draft: RecoveryReadinessPlanDraft, signals: readonly ReadinessSignal[]) => {
    setLoading(true);
    const result = await orchestrator.bootstrap(draft, [...signals]);
    if (result.ok) {
      await hydrateState();
    }
    return result;
  }, [hydrateState, orchestrator]);

  const activeRunIds = useMemo(() => runs.map((run) => run.plan.runId), [runs]);

  void bootstrapDraft;

  return {
    loading,
    runs,
    activeRunIds,
    summaries,
    streamId,
    warningCount,
    timelineLength,
  };
};
