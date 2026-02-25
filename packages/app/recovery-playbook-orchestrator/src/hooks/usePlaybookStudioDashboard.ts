import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { createStudioRunner } from '../studio/runtime/runner';
import { type StudioTimelineEntry } from '../studio/contracts';
import type { Result } from '@shared/result';
import type { StudioRunResult } from '@domain/recovery-playbook-studio-core';

interface DashboardState {
  readonly tenantId: string;
  readonly loading: boolean;
  readonly active: boolean;
  readonly timeline: readonly StudioTimelineEntry[];
  readonly run?: StudioRunResult;
  readonly diagnostics: Record<string, number>;
  readonly lastRunId?: string;
}

type DashboardAction =
  | { type: 'loading' }
  | { type: 'loaded'; payload: Record<string, number> }
  | { type: 'run'; payload: StudioRunResult }
  | { type: 'error'; error: string }
  | { type: 'reset' };

const reducer = (state: DashboardState, action: DashboardAction): DashboardState => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true };
    case 'loaded':
      return { ...state, loading: false, diagnostics: action.payload };
    case 'run':
      return {
        ...state,
        loading: false,
        active: true,
        run: action.payload,
        lastRunId: String(action.payload.run.runId),
      };
    case 'error':
      return { ...state, loading: false, active: false };
    case 'reset':
      return {
        ...state,
        loading: false,
        active: false,
        run: undefined,
      };
    default:
      return state;
  }
};

const defaultState = (tenantId: string): DashboardState => ({
  tenantId,
  loading: false,
  active: false,
  timeline: [],
  diagnostics: {},
});

export interface UsePlaybookStudioDashboardOptions {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
}

export const usePlaybookStudioDashboard = ({ tenantId, workspaceId, artifactId }: UsePlaybookStudioDashboardOptions) => {
  const [state, dispatch] = useReducer(reducer, defaultState(tenantId));

  useEffect(() => {
    let running = true;
    const load = async () => {
      dispatch({ type: 'loading' });
      const runner = await createStudioRunner({ tenantId, workspaceId, artifactId });
      if (!running) {
        await runner.dispose();
        return;
      }
      const values = await runner.diagnostics();
      dispatch({ type: 'loaded', payload: values });
      await runner.dispose();
    };
    void load();
    return () => {
      running = false;
    };
  }, [tenantId, workspaceId, artifactId]);

  const run = useCallback(
    async (command: unknown): Promise<Result<StudioRunResult, string>> => {
      dispatch({ type: 'loading' });
      const runner = await createStudioRunner({ tenantId, workspaceId, artifactId });
      const result = await runner.execute(command);
      if (!result.ok) {
        dispatch({ type: 'error', error: result.error });
      } else {
        dispatch({ type: 'run', payload: result.value });
      }
      await runner.dispose();
      return result;
    },
    [artifactId, tenantId, workspaceId],
  );

  const timeline = useMemo(() => {
    const localTimeline = state.timeline;
    const runTimeline = state.run
      ? [
          {
            sequence: state.run.run.steps.length + localTimeline.length,
            stage: 'execute',
            runId: state.run.run.runId,
            tenant: state.run.run.tenantId,
            workspace: state.run.run.workspaceId,
            severity: 'info',
            message: 'run finished',
          } as const,
        ]
      : [];

    return [...localTimeline, ...runTimeline] as readonly StudioTimelineEntry[];
  }, [state.run, state.timeline]);

  return {
    state: {
      ...state,
      timeline,
      tenantId,
    },
    run,
    reset: () => dispatch({ type: 'reset' }),
  };
};
