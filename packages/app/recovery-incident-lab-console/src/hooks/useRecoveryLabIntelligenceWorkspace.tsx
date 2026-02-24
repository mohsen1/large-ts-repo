import { useCallback, useMemo, useState } from 'react';
import {
  runLabIntelligenceScenario,
  buildLabIntelligencePlan,
  runLabIntelligenceBatch,
  type LabIntelligenceRunRequest,
  type LabIntelligenceRunResponse,
} from '../services/recoveryLabIntelligenceEngineService';
import type { StrategyLane, StrategyMode, StrategyTuple } from '@domain/recovery-lab-intelligence-core';
import type { StrategyPlan } from '@domain/recovery-lab-intelligence-core';
import type { SignalEvent } from '@domain/recovery-lab-intelligence-core';

interface LabWorkspaceState {
  readonly workspace: string;
  readonly scenario: string;
  readonly lane: StrategyLane;
  readonly mode: StrategyMode;
  readonly tuple: StrategyTuple;
  readonly plan?: StrategyPlan;
  readonly run?: LabIntelligenceRunResponse<Record<string, unknown>>;
  readonly batchRuns: readonly LabIntelligenceRunResponse<Record<string, unknown>>[];
  readonly seedSeed: string;
  readonly loading: boolean;
  readonly error?: string;
}

interface DraftSeed {
  readonly region: string;
  readonly service: string;
  readonly riskFloor: number;
}

const defaultSeed: DraftSeed = {
  region: 'us-east-1',
  service: 'recovery-intelligence',
  riskFloor: 20,
};

const toRequest = (state: LabWorkspaceState): LabIntelligenceRunRequest => ({
  workspace: state.workspace,
  scenario: state.scenario,
  mode: state.mode,
  lane: state.lane,
  seed: {
    seed: state.seedSeed,
    ...defaultSeed,
  },
});

export const useRecoveryLabIntelligenceWorkspace = () => {
  const [state, setState] = useState<LabWorkspaceState>({
    workspace: 'workspace:recovery-lab',
    scenario: 'incident-lab-studio',
    lane: 'forecast',
    mode: 'simulate',
    tuple: ['simulate', 'forecast', 'workspace:recovery-lab:incident-lab-studio', 1],
    batchRuns: [],
    seedSeed: 'seed-alpha',
    loading: false,
  });

  const setScenario = useCallback((scenario: string) => {
    setState((current) => ({
      ...current,
      scenario,
    }));
  }, []);

  const setWorkspace = useCallback((workspace: string) => {
    setState((current) => ({
      ...current,
      workspace,
    }));
  }, []);

  const setLane = useCallback((lane: StrategyLane) => {
    setState((current) => ({
      ...current,
      lane,
      tuple: [current.mode, lane, current.scenario, current.tuple[3]],
    }));
  }, []);

  const setMode = useCallback((mode: StrategyMode) => {
    setState((current) => ({
      ...current,
      mode,
      tuple: [mode, current.lane, current.scenario, current.tuple[3]],
    }));
  }, []);

  const setSeed = useCallback((seed: string) => {
    setState((current) => ({
      ...current,
      seedSeed: seed,
    }));
  }, []);

  const loadPlan = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const loaded = await buildLabIntelligencePlan(state.workspace, state.scenario);
      setState((current) => ({
        ...current,
        loading: false,
        plan: loaded.plan,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load plan',
      }));
    }
  }, [state.scenario, state.workspace]);

  const runOnce = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const request = toRequest(state);
      const response = await runLabIntelligenceScenario(request);
      setState((current) => ({
        ...current,
        loading: false,
        run: {
          ...response,
          request: {
            ...response.request,
            tuple: response.request.tuple,
          },
        },
        batchRuns: [...current.batchRuns, response],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Run failed',
      }));
    }
  }, [state]);

  const runBatch = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const batch = await runLabIntelligenceBatch(state.workspace, state.scenario);
      const mapped: readonly LabIntelligenceRunResponse<Record<string, unknown>>[] = batch.runs.map((entry) => ({
        runId: `${entry.plan.planId ?? 'batch'}-${entry.timing.durationMs}`,
        request: {
          workspace: state.workspace,
          scenario: state.scenario,
          mode: entry.request.mode as StrategyMode,
          lane: entry.request.lane as StrategyLane,
          seed: entry.request.seed,
          tuple: entry.request.tuple,
        },
        result: entry.result as LabIntelligenceRunResponse<Record<string, unknown>>['result'],
        plan: entry.plan,
        events: entry.result.events as readonly SignalEvent[],
        metrics: {
          durationMs: entry.timing.durationMs,
          eventCount: entry.result.events.length,
          warningCount: entry.result.warnings.length,
          criticalCount: entry.result.events.filter((event) => event.severity === 'critical' || event.severity === 'fatal').length,
          score: entry.result.score,
        },
      }));

      setState((current) => ({
        ...current,
        loading: false,
        batchRuns: mapped,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Batch run failed',
      }));
    }
  }, [state.scenario, state.workspace]);

  const reset = useCallback(() => {
    setState((current) => ({
      ...current,
      plan: undefined,
      run: undefined,
      batchRuns: [],
      error: undefined,
      loading: false,
    }));
  }, []);

  const signalSummary = useMemo(
    () =>
      state.run?.events.toSorted((left, right) =>
        left.at.localeCompare(right.at),
      ) ?? [],
    [state.run],
  );
  const latestScore = state.run?.result.score ?? 0;
  const scoreTrend = state.batchRuns.map((entry) => entry.result.score).toSorted();

  return {
    state,
    setScenario,
    setWorkspace,
    setLane,
    setMode,
    setSeed,
    loadPlan,
    runOnce,
    runBatch,
    reset,
    signalSummary,
    latestScore,
    scoreTrend,
    canRun: !state.loading && Boolean(state.plan),
  };
};
