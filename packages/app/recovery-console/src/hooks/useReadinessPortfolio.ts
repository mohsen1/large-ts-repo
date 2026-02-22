import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReadinessPolicy } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';
import { buildAdviceMap, ReadinessStrategyEngine } from '@service/recovery-readiness-orchestrator';
import type { Result } from '@shared/result';
import { buildReadinessPortfolio, type ReadinessPortfolio } from '@data/recovery-readiness-store';

interface PortfolioInput {
  tenant: string;
  planPolicy: ReadinessPolicy;
}

export interface ReadinessPortfolioState {
  readonly loading: boolean;
  readonly runs: readonly ReadinessReadModel[];
  readonly portfolio: ReadinessPortfolio;
  readonly topAdvice: string;
  readonly recommendations: ReadonlyArray<{ runId: string; recommendation: string }>;
  readonly bootstrap: (input: { draft: unknown; signals: readonly unknown[] }) => Promise<Result<string, Error>>;
}

export const useReadinessPortfolio = ({ tenant, planPolicy }: PortfolioInput): ReadinessPortfolioState => {
  const [repo] = useState<ReadinessRepository>(() => new MemoryReadinessRepository());
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<readonly ReadinessReadModel[]>([]);
  const [portfolio, setPortfolio] = useState<ReadinessPortfolio>({
    total: 0,
    byOwner: new Map(),
    bySignalDensity: [],
    atRiskRunIds: [],
  });
  const [topAdvice, setTopAdvice] = useState('none');
  const [recommendations, setRecommendations] = useState<ReadonlyArray<{ runId: string; recommendation: string }>>([]);
  const [engine] = useState(() => new ReadinessStrategyEngine(planPolicy, repo, { policy: planPolicy }));

  const hydrate = useCallback(async () => {
    setLoading(true);
    const active = await repo.listActive();
    const sorted = [...active].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

    setRuns(sorted);
    setPortfolio(buildReadinessPortfolio(sorted));
    const advice = buildAdviceMap(sorted);
    setTopAdvice(advice.topRun);
    setRecommendations(advice.byRun.map((item) => ({ runId: item.runId, recommendation: item.recommendation })));
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void hydrate();
  }, [hydrate, tenant]);

  const bootstrap = useCallback(
    async (input: { draft: unknown; signals: readonly unknown[] }) => {
      const result = await engine.execute({ type: 'bootstrap', draft: input.draft as never, signals: input.signals as never });
      if (result.ok) {
        await hydrate();
        return { ok: true, value: runs[0]?.plan.runId ?? 'none' } as Result<string, Error>;
      }
      return result;
    },
    [engine, hydrate, runs],
  );

  return {
    loading,
    runs,
    portfolio,
    topAdvice,
    recommendations,
    bootstrap,
  };
};
