import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ConstellationHookState,
  ConstellationOverviewFilters,
  ConstellationSummary,
  ConstellationPolicyInsight,
} from '../types';
import type {
  ConstellationOrchestrationPlan,
  ConstellationSignalEnvelope,
} from '@domain/incident-command-models';
import { mapPanelState, runConstellation, toPolicyInsights } from '../services/constellationService';

type CommandConstellationLoader = (
  plan: ConstellationOrchestrationPlan,
  options?: { includeTimeline?: boolean },
) => Promise<{
  readonly signals: readonly ConstellationSignalEnvelope[];
  readonly trace: readonly string[];
  readonly summary: ConstellationSummary;
  readonly plan: ConstellationOrchestrationPlan;
}>;

const DEFAULT_FILTERS: ConstellationOverviewFilters = {
  tenant: 'tenant:global',
  pageMode: 'planner',
  includeSimulationArtifacts: true,
};

const ensureArray = <T>(value: readonly T[] | undefined, fallback: readonly T[]): readonly T[] =>
  value?.length ? value : fallback;

export const useRecoveryCommandConstellation = (
  plan?: ConstellationOrchestrationPlan,
  loader?: CommandConstellationLoader,
): ConstellationHookState & {
  readonly panelState: ReturnType<typeof mapPanelState>;
  readonly insights: readonly ConstellationPolicyInsight[];
} => {
  const [filters] = useState<ConstellationOverviewFilters>(DEFAULT_FILTERS);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<ConstellationHookState['summary']>(undefined);
  const [signals, setSignals] = useState<ConstellationHookState['signals']>([]);
  const [trace, setTrace] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    if (!plan) {
      setLoading(false);
      setErrorMessage(undefined);
      setSummary(undefined);
      setSignals([]);
      setTrace([]);
      return;
    }

    let disposed = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setErrorMessage(undefined);
      try {
        const loaderResult = await (loader?.(plan, filters.includeSimulationArtifacts ? { includeTimeline: true } : undefined) ??
          runConstellation({
            tenant: filters.tenant.replace('tenant:', ''),
            plan,
            options: {
              includeTimeline: filters.includeSimulationArtifacts,
              includeTrace: true,
            },
          }).then((result) => ({
            signals: result.signals,
            trace: result.trace,
            summary: result.summary,
            plan: result.plan,
          })));
        if (!disposed) {
          setSummary(loaderResult.summary);
          setSignals(loaderResult.signals);
          setTrace(loaderResult.trace);
        }
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : 'Unknown constellation execution error');
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      disposed = true;
    };
  }, [filters, plan, loader, refreshCounter]);

  const panelState = useMemo(
    () =>
      plan
        ? mapPanelState(plan)
        : ({
            planId: 'constellation:pending',
            mode: 'compact',
            runCount: 0,
          } as ReturnType<typeof mapPanelState>),
    [plan],
  );
  const insights = useMemo(() => (plan ? toPolicyInsights(plan) : []), [plan]);
  const activeSignals = useMemo(() => ensureArray(signals, []), [signals]);

  const reload = useCallback(() => {
    setRefreshCounter((current) => current + 1);
  }, []);

  return useMemo(
    () => ({
      loading,
      errorMessage,
      summary,
      plan,
      signals: activeSignals,
      trace: ensureArray(trace, []),
      panelState,
      insights,
      reload,
    }),
    [loading, errorMessage, summary, plan, activeSignals, trace, panelState, insights, reload],
  );
};
