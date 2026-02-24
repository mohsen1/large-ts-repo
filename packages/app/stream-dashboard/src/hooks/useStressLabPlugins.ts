import { useEffect, useMemo, useState } from 'react';
import { runRegistryHarness } from '../services/registryHarness';

export interface StressLabPluginHookState {
  readonly ready: boolean;
  readonly tenantId: string;
  readonly stage: 'input' | 'shape' | 'plan' | 'simulate' | 'recommend';
  readonly entries: readonly string[];
  readonly summary: string | null;
  readonly summaryCount: number;
  readonly loading: boolean;
  readonly lastError: string | null;
}

export const useStressLabPlugins = (tenantId: string) => {
  const [state, setState] = useState<StressLabPluginHookState>({
    ready: false,
    tenantId,
    stage: 'input',
    entries: [],
    summary: null,
    summaryCount: 0,
    loading: true,
    lastError: null,
  });

  const stages = useMemo<StressLabPluginHookState['stage'][]>(() => ['input', 'shape', 'plan', 'simulate', 'recommend'], []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        setState((current) => ({ ...current, loading: true, lastError: null, stage: current.stage }));
        const stage = stages[Math.floor((Date.now() / 10_000) % stages.length)];
        const result = await runRegistryHarness({ tenantId, preferredStage: stage });

        if (cancelled) {
          return;
        }

        setState({
          ready: result.registered.length > 0,
          tenantId: result.tenantId,
          stage,
          entries: result.pluginSummary,
          summary: result.summary,
          summaryCount: result.pluginSummary.length,
          loading: false,
          lastError: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          lastError: error instanceof Error ? error.message : String(error),
        }));
      }
    };

    void hydrate();
    const timer = setInterval(() => {
      void hydrate();
    }, 11_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [stages, tenantId]);

  const refresh = async () => {
    const next = stages[(stages.indexOf(state.stage) + 1) % stages.length];
    const result = await runRegistryHarness({ tenantId, preferredStage: next });

    setState((current) => ({
      ...current,
      stage: next,
      entries: result.pluginSummary,
      summary: result.summary,
      ready: result.registered.length > 0,
      summaryCount: result.pluginSummary.length,
      lastError: null,
    }));
  };

  const reset = () => {
    setState({
      ready: false,
      tenantId,
      stage: 'input',
      entries: [],
      summary: null,
      summaryCount: 0,
      loading: false,
      lastError: null,
    });
  };

  return {
    ...state,
    refresh,
    reset,
    readyLabel: state.ready ? 'ready' : 'not-ready',
    hasEntries: state.entries.length > 0,
  } as const;
};
