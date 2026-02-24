import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { runMeshControlPlan, runMeshControlCompatibilityChecks, type MeshControlExecutionRequest, type MeshControlExecutionResult } from '../services/meshControlPlaneScenarioService';

type SortDirection = 'asc' | 'desc';
type NoInfer<T> = [T][T extends unknown ? 0 : never];
type AsyncResult<T> = Promise<T>;

interface MeshControlPlaneState {
  readonly loading: boolean;
  readonly runs: readonly MeshControlExecutionResult[];
  readonly errors: readonly string[];
  readonly selectedRunId: string | undefined;
  readonly requestMap: ReadonlyMap<string, MeshControlExecutionRequest>;
  readonly sortedByScore: SortDirection;
}

interface MeshControlPlaneContext {
  readonly runId: string;
  readonly lane: string;
  readonly scenario: string;
}

type Action =
  | { readonly type: 'start' }
  | { readonly type: 'loaded'; readonly runs: readonly MeshControlExecutionResult[]; readonly requests: readonly MeshControlExecutionRequest[] }
  | { readonly type: 'append'; readonly run: MeshControlExecutionResult }
  | { readonly type: 'setSelected'; readonly runId: string | undefined }
  | { readonly type: 'sort'; readonly direction: SortDirection }
  | { readonly type: 'clearError' }
  | { readonly type: 'error'; readonly message: string };

const initialState = {
  loading: false,
  runs: [],
  errors: [],
  selectedRunId: undefined,
  requestMap: new Map(),
  sortedByScore: 'desc',
} satisfies MeshControlPlaneState;

const reducer = (state: MeshControlPlaneState, action: Action): MeshControlPlaneState => {
  switch (action.type) {
    case 'start': {
      return { ...state, loading: true, errors: [] };
    }
    case 'loaded': {
      const requestMap = new Map<string, MeshControlExecutionRequest>();
      action.runs.forEach((run, index) => {
        requestMap.set(run.runId, {
          tenantId: run.runId.split('::')[0],
          lane: run.lanes[index % run.lanes.length] as 'signal',
          mode: 'control',
          selectedSignals: run.traces,
        });
      });
      return { ...state, loading: false, runs: action.runs, requestMap };
    }
    case 'append':
      return { ...state, loading: false, runs: [...state.runs, action.run] };
    case 'setSelected':
      return { ...state, selectedRunId: action.runId };
    case 'sort':
      return { ...state, sortedByScore: action.direction };
    case 'clearError':
      return { ...state, errors: [] };
    case 'error':
      return { ...state, loading: false, errors: [...state.errors, action.message] };
    default:
      return state;
  }
};

const uniqueRuns = (runs: readonly MeshControlExecutionResult[]): readonly MeshControlExecutionResult[] => {
  const map = new Map<string, MeshControlExecutionResult>();
  for (const run of runs) {
    map.set(run.runId, run);
  }
  return [...map.values()];
};

const summarizeRuns = (runs: readonly MeshControlExecutionResult[]): ReadonlyMap<'signal' | 'policy' | 'policy-unknown', number> => {
  const summary = new Map<'signal' | 'policy' | 'policy-unknown', number>([
    ['signal', 0],
    ['policy', 0],
    ['policy-unknown', 0],
  ]);
  for (const run of runs) {
    const lane = run.lanes.includes('policy') ? 'policy' : 'signal';
    summary.set(lane as 'policy' | 'signal', (summary.get(lane as 'policy' | 'signal') ?? 0) + 1);
  }
  return summary;
};

const directionFrom = (value: NoInfer<SortDirection>): SortDirection => value === 'asc' ? 'asc' : 'desc';

export const useMeshControlPlane = (tenantId: string) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lockRef = useRef<AsyncResult<void> | undefined>(undefined);

  const reload = useCallback(async () => {
    if (lockRef.current !== undefined) {
      return;
    }
    dispatch({ type: 'start' });
    const task: AsyncResult<void> = (async () => {
      try {
        const runs = await runMeshControlCompatibilityChecks(tenantId);
        dispatch({ type: 'loaded', runs: uniqueRuns(runs), requests: [] });
      } catch (error) {
        dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        lockRef.current = undefined;
      }
    })();
    lockRef.current = task;
    await task;
  }, [tenantId]);

  useEffect(() => {
    void reload();
    return () => {
      lockRef.current = undefined;
    };
  }, [reload]);

  const runScenario = useCallback(async (context: MeshControlPlaneContext) => {
    dispatch({ type: 'start' });
    try {
      const run = await runMeshControlPlan(context.runId, context.lane, [context.scenario, context.scenario, 'control'], context.scenario);
      dispatch({ type: 'append', run });
      dispatch({ type: 'setSelected', runId: run.runId });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const sortByScore = useCallback((direction: SortDirection) => {
    dispatch({ type: 'sort', direction: directionFrom(direction) });
  }, []);

  const sortedRuns = useMemo(() => {
    const list = [...state.runs];
    return list.toSorted((left, right) => {
      const direction = directionFrom(state.sortedByScore);
      return direction === 'asc' ? left.score - right.score : right.score - left.score;
    });
  }, [state.runs, state.sortedByScore]);

  const selectedRun = useMemo(
    () => sortedRuns.find((run) => run.runId === state.selectedRunId),
    [sortedRuns, state.selectedRunId],
  );

  return {
    loading: state.loading,
    runs: sortedRuns,
    errors: state.errors,
    selectedRun,
    requestMap: state.requestMap,
    runCount: state.runs.length,
    laneSummary: summarizeRuns(state.runs),
    refresh: reload,
    runScenario,
    setSelectedRun: (runId: string | undefined) => dispatch({ type: 'setSelected', runId }),
    clearErrors: () => dispatch({ type: 'clearError' }),
    toggleSort: () => sortByScore(directionFrom(state.sortedByScore) === 'asc' ? 'desc' : 'asc'),
  };
};
