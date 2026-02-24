import { useCallback, useMemo, useReducer } from 'react';
import {
  buildRecoveryTargetsFromSignals,
  runAdvancedWorkflowSession,
  type AdvancedWorkflowRunResult,
  type AdvancedWorkflowInput,
} from '../services/stressLabAdvancedWorkflow';
import { type WorkloadTarget } from '@domain/recovery-stress-lab';

interface OrchestratorState {
  readonly status: 'idle' | 'running' | 'ready' | 'error';
  readonly runCount: number;
  readonly latestResult: AdvancedWorkflowRunResult | null;
  readonly latestError: string | null;
  readonly topology: { readonly nodes: number; readonly edges: number };
  readonly queue: readonly string[];
}

type Action =
  | { readonly type: 'run_started' }
  | { readonly type: 'run_completed'; readonly result: AdvancedWorkflowRunResult; readonly topology: { readonly nodes: number; readonly edges: number } }
  | { readonly type: 'run_failed'; readonly message: string }
  | { readonly type: 'reset' };

const reducer = (state: OrchestratorState, action: Action): OrchestratorState => {
  switch (action.type) {
    case 'run_started':
      return { ...state, status: 'running', latestError: null };
    case 'run_completed': {
      const queue = [...state.queue, action.result.runId].slice(-20);
      return {
        ...state,
        status: 'ready',
        runCount: state.runCount + 1,
        latestResult: action.result,
        topology: action.topology,
        queue,
      };
    }
    case 'run_failed':
      return { ...state, status: 'error', latestError: action.message };
    case 'reset':
      return {
        status: 'idle',
        runCount: 0,
        latestResult: null,
        latestError: null,
        topology: { nodes: 0, edges: 0 },
        queue: [],
      };
    default:
      return state;
  }
};

const initialState: OrchestratorState = {
  status: 'idle',
  runCount: 0,
  latestResult: null,
  latestError: null,
  topology: { nodes: 0, edges: 0 },
  queue: [],
};

export interface UseStressLabOrchestratorResult {
  readonly state: OrchestratorState;
  readonly run: (input: AdvancedWorkflowInput) => Promise<void>;
  readonly reset: () => void;
  readonly isBusy: boolean;
  readonly canRun: (input: AdvancedWorkflowInput) => boolean;
  readonly lastRunId: string | null;
  readonly topology: { readonly nodes: number; readonly edges: number };
}

const runStateSignature = (input: AdvancedWorkflowInput): string =>
  `${input.tenantId}-${input.signals.length}-${input.runbooks.length}`;

export const useStressLabOrchestrator = (): UseStressLabOrchestratorResult => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const lastRunId = useMemo(() => {
    if (state.latestResult === null) {
      return null;
    }
    return state.latestResult.runId;
  }, [state.latestResult?.runId, state.runCount]);

  const run = useCallback(async (input: AdvancedWorkflowInput) => {
    const signalTargets = buildRecoveryTargetsFromSignals(input.tenantId, input.signals);
    dispatch({ type: 'run_started' });
    try {
      const runInput: AdvancedWorkflowInput = {
        ...input,
        targets: input.targets.length === 0 ? signalTargets : input.targets,
      };
      const result = await runAdvancedWorkflowSession(runInput);
      dispatch({
        type: 'run_completed',
        result,
        topology: { nodes: result.topologyNodeCount, edges: result.topologyEdgeCount },
      });
    } catch (error) {
      dispatch({ type: 'run_failed', message: String(error instanceof Error ? error.message : error) });
    }
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const canRun = useCallback((input: AdvancedWorkflowInput) => {
    const hasSignals = input.signals.length > 0;
    const hasRunbooks = input.runbooks.length > 0;
    const targetsReady = input.targets.length > 0 || input.signals.length > 0;
    return hasSignals && hasRunbooks && targetsReady;
  }, []);

  return {
    state,
    run,
    reset,
    isBusy: state.status === 'running',
    canRun,
    lastRunId,
    topology: state.topology,
  };
};
