import { useCallback, useEffect, useMemo, useState } from 'react';
import { HorizonLabService, buildServiceHandle } from '../services/horizonLabService';
import {
  horizonBrand,
  type HorizonPlan,
  type PluginStage,
  type PlanId,
  type TimeMs,
} from '@domain/recovery-horizon-engine';
import type {
  HorizonLabState,
  HorizonWorkspace,
  HorizonWorkspaceFilters,
} from '../types';
import type {
  HorizonLookupConfig,
  HorizonReadResult,
  HorizonMutationEvent,
} from '@data/recovery-horizon-store';
import type {
  HorizonOrchestratorResult,
  HorizonRunnerContract,
  HorizonServiceSnapshot,
  HorizonServiceStats,
  StageReport,
} from '@service/recovery-horizon-orchestrator';

type ResultState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly queryResult: HorizonReadResult;
      readonly snapshot: HorizonServiceSnapshot;
      readonly stats: HorizonServiceStats;
      readonly report: StageReport;
    };

const defaultFilters = {
  tenantId: 'tenant-001',
  stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const,
  includeArchived: false,
  includeDiagnostics: true,
} satisfies HorizonWorkspaceFilters;

const nowMs = (): TimeMs => horizonBrand.fromTime(Date.now());

const toLookup = (filters: HorizonWorkspaceFilters): HorizonLookupConfig => ({
  tenantId: filters.tenantId,
  stages: filters.stages,
  includeArchived: filters.includeArchived,
  maxRows: 250,
});

const defaultState = (): HorizonLabState => ({
  config: {
    tenantId: 'tenant-001',
    planName: 'recovery-horizon-lab-default',
    stageWindow: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
    refreshIntervalMs: 4500,
    tags: ['recovery', 'horizon'],
    owner: 'ui',
  },
  loading: false,
  lastQuery: defaultFilters,
  snapshots: [defaultFilters],
  plans: [],
  signals: [],
  events: [],
  selectedPlanId: undefined,
  selectedSignalKind: 'all',
  elapsedMs: nowMs(),
});

const buildReport = (tenantId: string): StageReport => {
  const stages = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;

  return {
    runId: horizonBrand.fromRunId(`report-${tenantId}`),
    planName: `horizon-${tenantId}`,
    elapsedMs: nowMs(),
    stages: stages.map((stage, order) => ({
      stage,
      startedAt: nowMs(),
      elapsedMs: horizonBrand.fromTime((order + 1) * 20),
      ok: true,
      errors: [],
    })),
  };
};

const pickPlans = (items: readonly { plan?: HorizonPlan }[]) => {
  const plans: HorizonPlan[] = [];
  for (const item of items) {
    if (item.plan) {
      plans.push(item.plan);
    }
  }
  return plans;
};

export const useHorizonLabWorkspace = (): HorizonWorkspace => {
  const [state, setState] = useState<HorizonLabState>(defaultState);
  const [resultState, setResultState] = useState<ResultState>({ status: 'idle' });
  const [runner] = useState<HorizonRunnerContract>(() => buildServiceHandle(new HorizonLabService()));

  const refresh = useCallback(
    async (tenantId: string) => {
      setState((previous) => ({ ...previous, loading: true }));
      setResultState({ status: 'loading' });

      try {
        const lookup = toLookup(state.lastQuery);
        const query = await runner.query({
          tenantId,
          includeArchived: lookup.includeArchived ?? false,
          maxRows: lookup.maxRows,
        });
        const snapshot = await runner.snapshot(lookup);
        const events = await runner.replayEvents(lookup);

        const plans = pickPlans(query.items);
        const stages = state.lastQuery.stages.reduce<Record<PluginStage, number>>((acc, stage) => {
          acc[stage] = query.items.filter((item) => item.signal.kind === stage).length;
          return acc;
        }, {
          ingest: 0,
          analyze: 0,
          resolve: 0,
          optimize: 0,
          execute: 0,
        });

        const stats = {
          totalPlans: query.total,
          stageMix: stages,
          mutationCount: events.length,
        } satisfies HorizonServiceStats;

        setState((previous) => ({
          ...previous,
          loading: false,
          plans,
          signals: query.items.map((entry) => entry.signal),
          events,
          lastQuery: {
            ...previous.lastQuery,
            tenantId,
          },
          snapshots: [...previous.snapshots, { ...previous.lastQuery, tenantId }],
          elapsedMs: nowMs(),
          selectedSignalKind: previous.selectedSignalKind,
          selectedPlanId: previous.selectedPlanId,
        }));

        setResultState({
          status: 'ready',
          queryResult: query,
          snapshot,
          stats,
          report: buildReport(tenantId),
        });
      } catch (error) {
        setResultState({ status: 'idle' });
        setState((previous) => ({ ...previous, loading: false }));
        throw error;
      }
    },
    [runner, state.lastQuery],
  );

  const run = useCallback(
    async (plan: HorizonPlan) => {
      setState((previous) => ({ ...previous, loading: true }));
      const runResult: HorizonOrchestratorResult = await runner.run(plan);
      const nextElapsed = horizonBrand.fromTime(Number(runResult.elapsedMs) + Number(state.elapsedMs));

      setState((previous) => ({
        ...previous,
        loading: false,
        plans: previous.plans.some((item) => item.id === plan.id) ? previous.plans : [...previous.plans, plan],
        selectedPlanId: runResult.ok ? plan.id : previous.selectedPlanId,
        elapsedMs: nextElapsed,
      }));
      await refresh(plan.tenantId);
    },
    [runner, refresh, state.elapsedMs],
  );

  const stop = useCallback(async () => {
    if (!state.selectedPlanId) {
      return;
    }
    await runner.drain(state.selectedPlanId);
    setState((previous) => ({ ...previous, selectedPlanId: undefined }));
  }, [runner, state.selectedPlanId]);

  const selectPlan = useCallback((planId?: PlanId) => {
    setState((previous) => ({ ...previous, selectedPlanId: planId }));
  }, []);

  const applyFilters = useCallback((filters: Partial<HorizonWorkspaceFilters>) => {
    setState((previous) => ({
      ...previous,
      lastQuery: {
        ...previous.lastQuery,
        ...filters,
      },
    }));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh(state.lastQuery.tenantId);
    }, state.config.refreshIntervalMs);

    return () => clearInterval(timer);
  }, [refresh, state.config.refreshIntervalMs, state.lastQuery.tenantId]);

  return {
    state,
    actions: {
      refresh,
      run,
      stop,
      applyFilters,
      selectPlan,
    },
    report: resultState.status === 'ready' ? resultState.report : undefined,
    snapshot: resultState.status === 'ready' ? resultState.snapshot : undefined,
    stats: resultState.status === 'ready' ? resultState.stats : undefined,
    queryResult: resultState.status === 'ready' ? resultState.queryResult : undefined,
    runner,
  };
};

export const useHorizonLabStageSummary = () => {
  const workspace = useHorizonLabWorkspace();
  const byStage = useMemo(
    () =>
      workspace.state.signals.reduce<Record<PluginStage, number>>(
        (acc, signal) => {
          acc[signal.kind] = (acc[signal.kind] ?? 0) + 1;
          return acc;
        },
        {
          ingest: 0,
          analyze: 0,
          resolve: 0,
          optimize: 0,
          execute: 0,
        },
      ),
    [workspace.state.signals],
  );

  return {
    totalSignals: workspace.state.signals.length,
    totalPlans: workspace.state.plans.length,
    selectedPlanId: workspace.state.selectedPlanId,
    elapsedMs: workspace.state.elapsedMs,
    byStage,
  };
};
