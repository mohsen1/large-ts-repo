import { useCallback, useMemo, useState } from 'react';
import {
  loadSeedScenario,
  loadSeedPolicy,
  loadSeedRun,
  parseScenarioPolicy,
  parseScenarioRun,
} from '../services/sagaApi';
import type { SagaWorkspaceOutcome, SagaWorkspaceState, SagaTab } from '../types';
import { useSagaPlugins } from './useSagaPlugins';
import { toOutcomeBundle } from '../services/sagaAdapters';

const emptyState: SagaWorkspaceState = {
  selectedTab: 'timeline',
  pluginStatus: [],
  loading: true,
  lastSummary: 'ready',
};

const normalizeTab = (value: string): SagaTab =>
  value === 'events' || value === 'topology' || value === 'policies' ? value : 'timeline';

export const useSagaOrchestrator = () => {
  const [state, setState] = useState<SagaWorkspaceState>(emptyState);
  const [scenario, setScenario] = useState<SagaWorkspaceOutcome | undefined>(undefined);
  const { plugins, flip } = useSagaPlugins();

  const hydrate = useCallback(async () => {
    try {
      const bundle = await loadSeedScenario();
      const runPayload = loadSeedRun(bundle.run.id);
      const policyPayload = loadSeedPolicy(bundle.policy.id as string);
      const [runValue, policyValue] = await Promise.all([runPayload, policyPayload]);
      const parsedRun = parseScenarioRun({
        ...bundle.run,
        ...(typeof runValue === 'object' && runValue !== null ? runValue : {}),
      }).payload;
      const parsedPolicy = parseScenarioPolicy({
        ...bundle.policy,
        ...(typeof policyValue === 'object' && policyValue !== null ? policyValue : {}),
      }).payload;
      const outcome = toOutcomeBundle(parsedRun, bundle.plan, parsedPolicy);
      setScenario(outcome);
      setState((previous) => ({
        ...previous,
        run: parsedRun,
        plan: bundle.plan,
        policy: parsedPolicy,
        bundle: outcome.bundle,
        pluginStatus: plugins,
        lastSummary: outcome.result.ok ? 'bootstrapped' : 'bootstrap-failed',
        loading: false,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : 'unknown-error',
      }));
    }
  }, [plugins]);

  const selectTab = useCallback((tab: string) => {
    setState((previous) => ({
      ...previous,
      selectedTab: normalizeTab(tab),
    }));
  }, []);

  const pluginFlip = useCallback(
    (name: string) => {
      flip(name);
      setState((previous) => ({
        ...previous,
        pluginStatus: previous.pluginStatus.map((status) =>
          status.plugin === name
            ? {
                ...status,
                enabled: !status.enabled,
                status: status.status === 'running' ? 'stopped' : 'running',
              }
            : status,
        ),
      }));
    },
    [flip],
  );

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true }));
    await hydrate();
  }, [hydrate]);

  const derived = useMemo(() => {
    const active = plugins.filter((item) => item.enabled).map((item) => item.plugin);
    return {
      active,
      statusText: `${state.lastSummary} :: active=${active.length}`,
      loading: state.loading,
      scenario,
    };
  }, [plugins, state.lastSummary, state.loading, scenario]);

  return {
    state,
    hydrate,
    selectTab,
    pluginFlip,
    refresh,
    derived,
  };
};
