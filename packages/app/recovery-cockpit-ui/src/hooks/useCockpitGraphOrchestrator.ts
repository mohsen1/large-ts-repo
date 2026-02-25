import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  buildGraphService,
  type GraphOrchestrationEvent,
  type GraphServiceState,
  type GraphSessionMode,
} from '../services/recoveryCockpitGraphService';

export type GraphHookState = {
  readonly status: 'idle' | 'running' | 'done' | 'error';
  readonly events: readonly GraphOrchestrationEvent[];
  readonly service: ReturnType<typeof buildGraphService>;
};

type Action =
  | { type: 'START' }
  | { type: 'DONE'; events: readonly GraphOrchestrationEvent[] }
  | { type: 'ERROR'; event: GraphOrchestrationEvent }
  | { type: 'RESET' };

const reducer = (state: GraphHookState, action: Action): GraphHookState => {
  switch (action.type) {
    case 'START':
      return { ...state, status: 'running' };
    case 'DONE':
      return { ...state, status: 'done', events: action.events };
    case 'ERROR':
      return { ...state, status: 'error', events: [...state.events, action.event] };
    case 'RESET':
      return {
        ...state,
        status: 'idle',
        events: [],
      };
    default:
      return state;
  }
};

export const useCockpitGraphOrchestrator = ({
  tenant,
  scenario,
  mode,
}: {
  tenant: string;
  scenario: string;
  mode: GraphSessionMode;
}) => {
  const service = useMemo(() => buildGraphService({ tenant, scenario, mode }), [tenant, scenario, mode]);

  const [state, dispatch] = useReducer(reducer, {
    status: 'idle',
    events: [],
    service,
  });

  const start = useCallback(async () => {
    dispatch({ type: 'START' });
    try {
      const result = await state.service.start();
      dispatch({
        type: 'DONE',
        events: [
          ...state.events,
          {
            at: new Date().toISOString(),
            kind: 'metric',
            detail: `execution:${result.runId}:${result.elapsedMs}`,
          },
          ...result.traces,
        ],
      });
    } catch (error) {
      dispatch({
        type: 'ERROR',
        event: {
          at: new Date().toISOString(),
          kind: 'error',
          detail: (error as Error).message,
        },
      });
    }
  }, [state.events, state.service]);

  useEffect(() => {
    dispatch({
      type: 'RESET',
    });
  }, [tenant, scenario, mode]);

  const workspaceState = useMemo(() => {
    return {
      ...service.state,
      events: state.events,
      status: state.status === 'idle' ? 'idle' : state.status === 'running' ? 'running' : state.status === 'done' ? 'completed' : 'failed',
    } as GraphServiceState;
  }, [service.state, state.events, state.status]);

  return {
    state,
    start,
    workspaceState,
    isRunning: state.status === 'running',
  };
};
