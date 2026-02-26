import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { ConstraintInput } from '@shared/type-level/stress-orion-constraints';
import type { OrbiRoute } from '@shared/type-level/stress-orion-constellation';
import type {
  OrionLabActions,
  OrionLabState,
  OrionEntityId,
  OrionRuntimeConfig,
  OrionTimelineEvent,
  OrionWorkspaceState,
} from '../types';
import {
  createInitialState,
  createOrionSession,
  executeOrionCommand,
  updateMetrics,
} from '../services/orionLabService';

interface OrionReducerAction {
  type:
    | 'set-state'
    | 'set-status'
    | 'set-work-item'
    | 'append-timeline'
    | 'append-failed'
    | 'set-metrics'
    | 'reset';
  payload?: {
    status?: OrionWorkspaceState;
    workItem?: OrionLabState['activeWorkItem'];
    timeline?: OrionTimelineEvent;
    failed?: string;
    metrics?: Partial<OrionLabState['metrics']>;
    state?: OrionLabState;
  };
}

const reducer = (state: OrionLabState, action: OrionReducerAction): OrionLabState => {
  switch (action.type) {
    case 'set-state':
      return action.payload?.state ?? state;
    case 'set-status': {
      const next = action.payload?.status;
      if (!next) {
        return state;
      }

      return {
        ...state,
        status: next,
        metrics: {
          ...state.metrics,
          lastTick: new Date().toISOString(),
        },
      };
    }
    case 'set-work-item': {
      if (!action.payload?.workItem) {
        return state;
      }

      return {
        ...state,
        activeWorkItem: action.payload.workItem,
        items: [...state.items, action.payload.workItem],
        metrics: {
          ...state.metrics,
          executed: state.metrics.executed + 1,
          succeeded: state.metrics.succeeded + 1,
          lastTick: new Date().toISOString(),
        },
      };
    }
    case 'append-timeline': {
      if (!action.payload?.timeline) {
        return state;
      }

      return {
        ...state,
        timeline: [action.payload.timeline, ...state.timeline].slice(0, 120),
      };
    }
    case 'append-failed': {
      if (!action.payload?.failed) {
        return state;
      }

      return {
        ...state,
        metrics: {
          ...state.metrics,
          failed: [...state.metrics.failed, action.payload.failed],
        },
      };
    }
    case 'set-metrics': {
      const base = state.metrics;
      const next = action.payload?.metrics;
      if (!next) {
        return state;
      }

      return {
        ...state,
        metrics: {
          ...base,
          ...next,
          lastTick: new Date().toISOString(),
          executed: typeof next.executed === 'number' ? next.executed : base.executed,
          succeeded: typeof next.succeeded === 'number' ? next.succeeded : base.succeeded,
        },
      };
    }
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
};

export const useOrionLabWorkspace = (config: OrionRuntimeConfig = {
  workspace: 'orion-workspace-alpha',
  autoRefreshMs: 3000,
  allowAutoReplay: true,
  maxParallel: 4,
  maxDepth: 24,
}) => {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const initial = createInitialState();
    return {
      ...initial,
      config,
    };
  });

  const withSession = useMemo(() => {
    const session = createOrionSession(config.workspace);
    return {
      session,
      dispose: () => {
        session.close();
      },
    };
  }, [config.workspace]);

  const pushTimeline = useCallback((entry: OrionTimelineEvent) => {
    dispatch({ type: 'append-timeline', payload: { timeline: entry } });
  }, []);

  const transition = useCallback((next: OrionWorkspaceState) => {
    dispatch({ type: 'set-status', payload: { status: next } });
  }, []);

  const run = useCallback(async (route: ConstraintInput<'incident', 'compose', string> | OrbiRoute) => {
    try {
      transition('routing');
      const candidate = await executeOrionCommand(route as OrbiRoute, state.status, transition);
      dispatch({ type: 'set-work-item', payload: { workItem: candidate } });
      transition('observing');
      pushTimeline({
        id: config.workspace,
        stage: 'observing',
        emittedAt: new Date().toISOString(),
        envelope: {
          kind: 'route',
          route: candidate.route,
          parts: candidate.profile.parts,
          payload: candidate.profile,
          generated: {
            route: candidate.route,
            parts: candidate.profile.parts,
          },
        },
      });
      transition('complete');
      return candidate;
    } catch (error) {
      dispatch({ type: 'append-failed', payload: { failed: error instanceof Error ? error.message : 'command failed' } });
      transition('error');
      throw error instanceof Error ? error : new Error('command failed');
    }
  }, [config.workspace, pushTimeline, state.status, transition]);

  const cancel = useCallback(async (route: OrbiRoute) => {
    transition('error');
    dispatch({ type: 'append-failed', payload: { failed: `cancelled:${route}` } });
  }, [transition]);

  const refresh = useCallback(async () => {
    transition('warming');
    await Promise.resolve(void 0);
    dispatch({
      type: 'set-metrics',
      payload: {
        metrics: updateMetrics(state.metrics, {
          executed: 1,
          succeeded: 1,
          failed: [],
          lastTick: new Date().toISOString(),
          latencyMs: state.config.autoRefreshMs,
        }),
      },
    });
    transition('idle');
  }, [state.metrics, state.config.autoRefreshMs, transition]);

  const replay = useCallback(async (id: OrionEntityId) => {
    transition('discovering');
    const match = state.items.find((item) => item.route.includes(id));

    if (!match) {
      dispatch({ type: 'append-failed', payload: { failed: `replay-miss:${id}` } });
      transition('error');
      return;
    }

    await run(match.route);
  }, [run, state.items, transition]);

  const clear = useCallback(() => {
    transition('idle');
    dispatch({ type: 'reset' });
  }, [transition]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (state.status === 'complete') {
        transition('idle');
      }
      if (state.status === 'error' && state.metrics.failed.length > 3) {
        dispatch({ type: 'reset' });
      }
    }, config.autoRefreshMs);

    return () => {
      clearInterval(interval);
      withSession.dispose();
    };
  }, [config.autoRefreshMs, state.status, state.metrics.failed.length, transition, withSession]);

  const actions: OrionLabActions = {
    run,
    cancel,
    refresh,
    replay,
    clear,
  };

  return { state, actions };
};
