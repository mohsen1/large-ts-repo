import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  runCompatibilityCheck,
  runRecoveryCockpitScenario,
  type MeshScenarioResult,
} from '../services/recoveryCockpitOrchestrationService';

type AsyncResult<T> = T;
type NoInfer<T> = [T][T extends any ? 0 : never];
type SortDirection = 'asc' | 'desc';

export interface MeshOrchestrationRequest {
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly mode: string;
  readonly selectedSignals: readonly string[];
}

export interface MeshOrchestrationState {
  readonly loading: boolean;
  readonly requestByScenario: Record<string, MeshOrchestrationRequest>;
  readonly history: readonly MeshScenarioResult[];
  readonly errors: readonly string[];
  readonly selectedScenario: string | undefined;
  readonly sortByScore: SortDirection;
}

type MeshOrchestrationAction =
  | { readonly type: 'start' }
  | { readonly type: 'loaded'; readonly results: readonly MeshScenarioResult[] }
  | { readonly type: 'append'; readonly result: MeshScenarioResult }
  | { readonly type: 'setSelected'; readonly scenarioId: string }
  | { readonly type: 'clearError' }
  | { readonly type: 'error'; readonly message: string };

const initialState = {
  loading: false,
  requestByScenario: Object.create(null),
  history: [],
  errors: [],
  selectedScenario: undefined,
  sortByScore: 'desc',
} satisfies MeshOrchestrationState;

const reducer = (state: MeshOrchestrationState, action: MeshOrchestrationAction): MeshOrchestrationState => {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true, errors: [] };
    case 'loaded':
      return {
        ...state,
        loading: false,
        history: action.results,
        requestByScenario: action.results.reduce<Record<string, MeshOrchestrationRequest>>((acc, result, index) => {
          const requestId = `compat-${index}-${result.runId}`;
          acc[requestId] = {
            tenantId: result.runId.split('::')[0],
            scenarioId: result.runId,
            mode: 'compatibility',
            selectedSignals: result.traces,
          };
          return acc;
        }, {}),
      };
    case 'append':
      return { ...state, loading: false, history: [...state.history, action.result] };
    case 'setSelected':
      return { ...state, selectedScenario: action.scenarioId };
    case 'clearError':
      return { ...state, errors: [] };
    case 'error':
      return { ...state, loading: false, errors: [...state.errors, action.message] };
    default:
      return state;
  }
};

const uniqueByRunId = (values: readonly MeshScenarioResult[]): MeshScenarioResult[] => {
  const seen = new Set<string>();
  return values.filter((entry) => {
    if (seen.has(entry.runId)) {
      return false;
    }
    seen.add(entry.runId);
    return true;
  });
};

const normalizeDirection = (direction: NoInfer<SortDirection>): SortDirection =>
  direction === 'asc' ? 'asc' : 'desc';

export const useMeshLabOrchestrator = (tenantId: string) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lockRef = useRef<Promise<AsyncResult<void>> | undefined>(undefined);

  const reloadCompatibility = useCallback(async () => {
    if (lockRef.current !== undefined) {
      return;
    }
    dispatch({ type: 'start' });
    const marker = (async () => {
      try {
        const runStack = new AsyncDisposableStack();
        try {
          const results = await runCompatibilityCheck(tenantId);
          dispatch({ type: 'loaded', results: uniqueByRunId(results) });
        } finally {
          await runStack.disposeAsync();
        }
      } catch (error) {
        dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        lockRef.current = undefined;
      }
    })();
    lockRef.current = marker;
    await marker;
  }, [tenantId]);

  useEffect(() => {
    void reloadCompatibility();
    return () => {
      lockRef.current = undefined;
    };
  }, [reloadCompatibility]);

  const runScenario = useCallback(
    async (scenarioId: string, mode: string, selectedSignals: readonly string[]) => {
      dispatch({ type: 'start' });
      try {
        const result = await runRecoveryCockpitScenario(tenantId, scenarioId, mode, selectedSignals);
        dispatch({ type: 'append', result });
      } catch (error) {
        dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    },
    [tenantId],
  );

  const sortedHistory = useMemo(() => {
    const list = [...state.history];
    const direction = normalizeDirection(state.sortByScore);
    return list.toSorted((left, right) => (direction === 'asc' ? left.score - right.score : right.score - left.score));
  }, [state.history, state.sortByScore]);

  return {
    loading: state.loading,
    history: sortedHistory,
    errors: state.errors,
    selectedScenario: state.selectedScenario,
    requestByScenario: state.requestByScenario,
    reload: reloadCompatibility,
    setSelectedScenario: (scenarioId: string) => dispatch({ type: 'setSelected', scenarioId }),
    clearErrors: () => dispatch({ type: 'clearError' }),
    runScenario,
  };
};

export type MeshLabOrchestratorHook = ReturnType<typeof useMeshLabOrchestrator>;
