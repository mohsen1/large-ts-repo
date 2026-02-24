import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { PluginStage, HorizonSignal, JsonLike } from '@domain/recovery-horizon-engine';
import { runLabCycle } from '@service/recovery-horizon-orchestrator';
import type { LabRunResponse } from '@service/recovery-horizon-orchestrator';
import { summarizeTenant } from '@service/recovery-horizon-orchestrator';
import { readSignalsWindow, type LabSignalWindow, type SignalWindowRequest } from '@service/recovery-horizon-orchestrator';
import { createRepository } from '@data/recovery-horizon-store';
import type { Result } from '@shared/result';

interface StageToggleAction {
  readonly stage: PluginStage;
  readonly on: boolean;
}

interface RunResult {
  readonly run: string;
  readonly at: number;
  readonly tenantId: string;
  readonly signalCount: number;
  readonly stages: readonly PluginStage[];
}

interface LabState {
  readonly tenantId: string;
  readonly selectedStages: readonly PluginStage[];
  readonly busy: boolean;
  readonly lastRun?: RunResult;
  readonly lastError: string | null;
  readonly summary?: {
    readonly signalCount: number;
    readonly planCount: number;
    readonly stage: readonly PluginStage[];
  };
  readonly windows?: readonly LabSignalWindow[];
  readonly timelines: readonly { readonly stage: PluginStage; readonly count: number }[];
}

const initialStages = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] satisfies readonly PluginStage[];

const initialState: LabState = {
  tenantId: 'tenant-001',
  selectedStages: initialStages,
  busy: false,
  lastError: null,
  timelines: [],
};

type LabAction =
  | { type: 'set-tenant'; tenantId: string }
  | { type: 'toggle-stage'; stage: StageToggleAction }
  | { type: 'set-busy'; busy: boolean }
  | { type: 'record-run'; result: RunResult }
  | { type: 'set-error'; message: string | null }
  | { type: 'set-summary'; summary: NonNullable<LabState['summary']> }
  | { type: 'set-windows'; windows: readonly LabSignalWindow[] }
  | { type: 'set-timelines'; timelines: readonly { readonly stage: PluginStage; readonly count: number }[] };

const labReducer = (state: LabState, action: LabAction): LabState => {
  switch (action.type) {
    case 'set-tenant':
      return { ...state, tenantId: action.tenantId, lastRun: undefined };
    case 'toggle-stage':
      if (action.stage.on) {
        if (state.selectedStages.includes(action.stage.stage)) {
          return state;
        }
        return { ...state, selectedStages: [...state.selectedStages, action.stage.stage] };
      }
      return {
        ...state,
        selectedStages: state.selectedStages.filter((stage) => stage !== action.stage.stage),
      };
    case 'set-busy':
      return { ...state, busy: action.busy };
    case 'record-run':
      return { ...state, lastRun: action.result, busy: false, lastError: null };
    case 'set-error':
      return { ...state, busy: false, lastError: action.message };
    case 'set-summary':
      return { ...state, summary: action.summary };
    case 'set-windows':
      return { ...state, windows: action.windows };
    case 'set-timelines':
      return { ...state, timelines: action.timelines };
    default:
      return state;
  }
};

const safeTenant = (tenantId: string) => tenantId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

const toResult = (run: LabRunResponse): RunResult => ({
  run: run.runId,
  at: Date.now(),
  tenantId: run.tenantId,
  signalCount: run.signalCount,
  stages: run.stageWindow,
});

const toTimelineStats = (
  windows: readonly LabSignalWindow[],
): readonly { readonly stage: PluginStage; readonly count: number }[] =>
  windows.map((window) => ({
    stage: window.stage,
    count: window.records.length,
  }));

const buildWindows = async (
  tenantId: string,
  stages: readonly PluginStage[],
  limit: number,
): Promise<Result<readonly LabSignalWindow[]>> => {
  const request: SignalWindowRequest = {
    tenantId,
    stageWindow: [...stages],
    limit,
  };
  return readSignalsWindow(request);
};

const buildSummary = async (tenantId: string, stages: readonly PluginStage[]) => {
  const repository = createRepository(tenantId);
  return summarizeTenant(tenantId, repository, stages);
};

export const useHorizonLab = () => {
  const [state, dispatch] = useReducer(labReducer, initialState);
  const [refreshMs, setRefreshMs] = useState(500);
  const abortRef = useRef<AbortController | null>(null);

  const tenantId = useMemo(() => safeTenant(state.tenantId), [state.tenantId]);
  const selectedStages = useMemo(() => state.selectedStages, [state.selectedStages]);

  const canRun = useMemo(() => selectedStages.length > 0 && !state.busy, [selectedStages.length, state.busy]);

  const toggle = useCallback((stage: PluginStage) => {
    dispatch({
      type: 'toggle-stage',
      stage: {
        stage,
        on: !state.selectedStages.includes(stage),
      },
    });
  }, [state.selectedStages]);

  const run = useCallback(async () => {
    if (!canRun) {
      return;
    }

    dispatch({ type: 'set-busy', busy: true });
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await runLabCycle(tenantId, selectedStages);
      if (!result.ok) {
        dispatch({ type: 'set-error', message: result.error.message });
        return;
      }

      dispatch({ type: 'record-run', result: toResult(result.value) });
    } catch (error) {
      dispatch({
        type: 'set-error',
        message: error instanceof Error ? error.message : 'lab run failed',
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
      if (abortRef.current === abort) {
        abortRef.current = null;
      }
    }
  }, [canRun, tenantId, selectedStages]);

  const refresh = useCallback(async () => {
    const summary = await buildSummary(tenantId, selectedStages);
    const windows = await buildWindows(tenantId, selectedStages, 250);

    if (summary.ok) {
      dispatch({
        type: 'set-summary',
        summary: {
          signalCount: summary.value.signalCount,
          planCount: summary.value.planCount,
          stage: summary.value.stages,
        },
      });
    }

    if (windows.ok) {
      dispatch({ type: 'set-windows', windows: windows.value });
      dispatch({ type: 'set-timelines', timelines: toTimelineStats(windows.value) });
    }
  }, [tenantId, selectedStages]);

  useEffect(() => {
    let active = true;
    let timer = window.setTimeout(() => {
      if (!active) {
        return;
      }
      void refresh();
      timer = window.setTimeout(() => void refresh(), refreshMs);
    }, refreshMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [refresh, refreshMs]);

  useEffect(() => {
    void refresh();
  }, [tenantId, selectedStages]);

  const hasSignals = state.timelines.some((entry) => entry.count > 0);
  const stages = useMemo(
    () => initialStages.filter((stage) => !selectedStages.includes(stage) || hasSignals || state.lastRun),
    [hasSignals, selectedStages],
  );

  return {
    tenantId,
    selectedStages,
    availableStages: stages,
    canRun,
    busy: state.busy,
    lastRun: state.lastRun,
    lastError: state.lastError,
    summary: state.summary,
    windows: state.windows,
    timelines: state.timelines,
    refreshMs,
    setTenant: (value: string) => dispatch({ type: 'set-tenant', tenantId: safeTenant(value) }),
    setRefreshMs,
    toggle,
    run,
    refresh,
  };
};

export type { LabSignalWindow, HorizonSignal, JsonLike };
