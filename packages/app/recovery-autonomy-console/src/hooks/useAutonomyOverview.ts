import { useCallback, useEffect, useMemo, useState } from 'react';
import { AutonomyRunStore } from '@data/recovery-autonomy-store';
import { AUTONOMY_SCOPE_SEQUENCE, asGraphId, type AutonomyScope, type AutonomySignalEnvelope, type AutonomyPlan } from '@domain/recovery-autonomy-graph';
import type { AutonomyRunRecord } from '@data/recovery-autonomy-store';

export interface UseAutonomyOverviewState {
  readonly loading: boolean;
  readonly records: readonly AutonomyRunRecord[];
  readonly signals: readonly AutonomySignalEnvelope[];
  readonly plans: readonly AutonomyPlan[];
}

export const useAutonomyOverview = (tenantId: string, graphId: string, scope?: AutonomyScope) => {
  const [state, setState] = useState<UseAutonomyOverviewState>({
    loading: false,
    records: [],
    signals: [],
    plans: [],
  });

  const query = useMemo(
    () => ({
      tenantId,
      graphId: asGraphId(graphId),
      scope,
      limit: 200,
    }),
    [tenantId, graphId, scope],
  );

  const hydrate = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const store = new AutonomyRunStore();
    const result = await store.query(query);
    if (!result.ok) {
      setState((current) => ({ ...current, loading: false }));
      return;
    }

    const records = result.value.items;
    const signals = records.map((record) => record.signal);
    const planCatalog = records.reduce<Map<string, AutonomyPlan>>((acc, entry) => {
      const planId = String(entry.signal.runId) as AutonomyPlan['planId'];
      if (!acc.has(planId)) {
        acc.set(planId, {
          planId,
          scopeTuple: AUTONOMY_SCOPE_SEQUENCE as unknown as AutonomyPlan['scopeTuple'],
          stages: AUTONOMY_SCOPE_SEQUENCE,
          expectedDurations: AUTONOMY_SCOPE_SEQUENCE.map((_, index) => 120 + index * 25),
          createdAt: entry.createdAt,
        } satisfies AutonomyPlan);
      }
      return acc;
    }, new Map());

    setState({
      loading: false,
      records,
      signals,
      plans: [...planCatalog.values()],
    });
  }, [query]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    ...state,
    hydrate,
  } as const;
};
