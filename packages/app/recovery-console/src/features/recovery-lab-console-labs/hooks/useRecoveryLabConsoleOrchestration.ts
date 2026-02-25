import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  createInitialState,
  mapRunOutputToResultRow,
  type RuntimeFacadeOptions,
  type RuntimeResultRow,
  type RuntimeWorkspaceState,
  type SeverityBand,
} from '../types';
import {
  type LabWorkspaceService,
  createLabWorkspaceService,
} from '../services/labConsoleService';
import { asLabRunId, type LabRunId } from '@domain/recovery-lab-console-labs';

type Action =
  | { type: 'run:start'; runId: LabRunId }
  | { type: 'run:done'; result: RuntimeResultRow; eventCount: number }
  | { type: 'run:error'; message: string }
  | { type: 'signal:change'; signal: string }
  | { type: 'mode:change'; mode: RuntimeFacadeOptions['mode'] }
  | { type: 'reset' };

const reduce = (state: RuntimeWorkspaceState, action: Action): RuntimeWorkspaceState => {
  switch (action.type) {
    case 'run:start':
      return {
        ...state,
        isBusy: true,
        lastRunId: action.runId as RuntimeWorkspaceState['lastRunId'],
        selectedPlugin: null,
      };
    case 'run:done': {
      const severity: SeverityBand = action.eventCount > 10 ? 'high' : 'low';
      return {
        ...state,
        isBusy: false,
        runCount: state.runCount + 1,
        outputSummary: action.result.summary,
        events: [
          ...state.events,
          {
            runId: action.result.runId,
            kind: 'completed',
            startedAt: new Date().toISOString(),
            diagnostics: [
              `events=${action.eventCount}`,
              `run=${action.result.runId}`,
            ],
          },
        ],
        severity,
      };
    }
    case 'run:error':
      return {
        ...state,
        isBusy: false,
        outputSummary: action.message,
        severity: 'critical',
      };
    case 'signal:change':
      return {
        ...state,
        signal: action.signal,
      };
    case 'mode:change':
      return {
        ...state,
        mode: action.mode,
      };
    case 'reset':
      return createInitialState({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        operator: state.operator,
        mode: state.mode,
      });
    default:
      return state;
  }
};

export interface UseLabOrchestratorParams extends RuntimeFacadeOptions {
  readonly diagnosticsLimit?: number;
}

export interface UseLabOrchestratorResult {
  readonly state: RuntimeWorkspaceState;
  readonly run: (signalValue: number, payload: Record<string, unknown>) => Promise<void>;
  readonly setSignal: (signal: string) => void;
  readonly setMode: (mode: RuntimeFacadeOptions['mode']) => void;
  readonly reset: () => void;
}

export const useRecoveryLabConsoleOrchestration = (
  options: UseLabOrchestratorParams,
): UseLabOrchestratorResult => {
  const [state, dispatch] = useReducer(reduce, createInitialState(options));
  const serviceRef = useRef<LabWorkspaceService>(createLabWorkspaceService(options));

  useEffect(() => {
    serviceRef.current = createLabWorkspaceService(options);
    dispatch({ type: 'reset' });
  }, [options.tenantId, options.workspaceId, options.operator, options.mode]);

  const run = useCallback(
    async (signalValue: number, payload: Record<string, unknown>) => {
      const runId = asLabRunId(`${options.tenantId}-${Date.now()}`);
      dispatch({ type: 'run:start', runId });

      try {
        const runResult = await serviceRef.current.run({
          tenantId: options.tenantId,
          workspaceId: options.workspaceId,
          signal: state.signal,
          score: signalValue,
          payload: {
            ...payload,
            timestamp: new Date().toISOString(),
          },
        });

        const mapped = mapRunOutputToResultRow({
          runId: runResult.run.runId,
          elapsedMs: runResult.run.elapsedMs,
          blueprintId: runResult.run.blueprintId,
          timeline: {
            stages: runResult.run.timeline.stages,
            events: runResult.run.timeline.events,
          },
        });

        dispatch({
          type: 'run:done',
          result: mapped,
          eventCount: runResult.run.timeline.events.length,
        });
      } catch (caught) {
        dispatch({
          type: 'run:error',
          message: caught instanceof Error ? caught.message : 'execution failed',
        });
      }
    },
    [options.tenantId, options.workspaceId, state.signal],
  );

  const setSignal = useCallback((signal: string) => {
    dispatch({ type: 'signal:change', signal });
  }, []);

  const setMode = useCallback((mode: RuntimeFacadeOptions['mode']) => {
    dispatch({ type: 'mode:change', mode });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const events = useMemo(() => {
    const limit = Math.max(0, Math.min(state.events.length, options.diagnosticsLimit ?? 200));
    return state.events.slice(-limit);
  }, [state.events, options.diagnosticsLimit]);

  return {
    state: {
      ...state,
      events,
    },
    run,
    setSignal,
    setMode,
    reset,
  };
};
