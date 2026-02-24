import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type { ConvergenceScope } from '@domain/recovery-lab-orchestration-core';
import {
  runStudioDiagnostics,
  runStudioWorkspace,
  summarizeTimelineState,
  type ScopedTimelineState,
  type StudioWorkspace,
} from '../services/convergenceStudioService';

export type StudioLoadingState = 'idle' | 'loading' | 'stale' | 'ready';

interface StudioState {
  readonly tenantId: string;
  readonly scopes: readonly ConvergenceScope[];
  readonly loading: StudioLoadingState;
  readonly workspace: StudioWorkspace | null;
  readonly timeline: ScopedTimelineState | null;
  readonly error: string | null;
}

type StudioAction =
  | { readonly type: 'reset'; readonly tenantId: string }
  | { readonly type: 'setScopes'; readonly scopes: readonly ConvergenceScope[] }
  | { readonly type: 'loading' }
  | { readonly type: 'ready'; readonly workspace: StudioWorkspace; readonly timeline: ScopedTimelineState }
  | { readonly type: 'error'; readonly error: string };

const reducer = (state: StudioState, action: StudioAction): StudioState => {
  switch (action.type) {
    case 'reset':
      return {
        ...state,
        tenantId: action.tenantId,
        loading: 'idle',
        workspace: null,
        timeline: null,
        error: null,
      };
    case 'setScopes':
      return {
        ...state,
        scopes: action.scopes,
      };
    case 'loading':
      return {
        ...state,
        loading: state.workspace ? 'stale' : 'loading',
        error: null,
      };
    case 'ready':
      return {
        ...state,
        loading: 'ready',
        workspace: action.workspace,
        timeline: summarizeTimelineState(action.timeline),
        error: null,
      };
    case 'error':
      return {
        ...state,
        loading: 'idle',
        error: action.error,
      };
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
};

const initialState = (tenantId: string): StudioState => ({
  tenantId,
  scopes: ['tenant', 'topology', 'signal', 'policy', 'fleet'],
  loading: 'idle',
  workspace: null,
  timeline: null,
  error: null,
});

const selectWorkspaceSummary = (workspace: StudioWorkspace) => ({
  count: workspace.runs.length,
  constraints: workspace.runs.reduce((acc, entry) => acc + entry.constraintCount, 0),
  runbooks: workspace.runs.reduce((acc, entry) => acc + entry.selectedRunbookCount, 0),
});

export const useConvergenceStudioOrchestrator = (tenantId: string) => {
  const deferredTenant = useDeferredValue(tenantId);
  const [state, dispatch] = useReducer(reducer, tenantId, initialState);

  const updateScope = useCallback((scopes: readonly ConvergenceScope[]) => {
    dispatch({ type: 'setScopes', scopes });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      dispatch({ type: 'loading' });

      try {
        const [workspace, timeline] = await Promise.all([
          runStudioWorkspace({ tenantId: deferredTenant, scopes: state.scopes }),
          runStudioDiagnostics(deferredTenant, state.scopes),
        ]);

        if (!cancelled) {
          dispatch({
            type: 'ready',
            workspace,
            timeline,
          });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: 'error', error: error instanceof Error ? error.message : String(error) });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredTenant, state.scopes]);

  const reset = useCallback(() => {
    dispatch({ type: 'reset', tenantId: deferredTenant });
  }, [deferredTenant]);

  const summary = useMemo(
    () => (state.workspace ? selectWorkspaceSummary(state.workspace) : null),
    [state.workspace],
  );

  const latestRunIds = useMemo(
    () => state.timeline?.runIds ?? [],
    [state.timeline?.runIds],
  );

  const isBusy = state.loading === 'loading' || state.loading === 'stale';
  const isReady = state.loading === 'ready';

  return {
    state,
    isBusy,
    isReady,
    summary,
    latestRunIds,
    updateScope,
    reset,
  } as const;
};
