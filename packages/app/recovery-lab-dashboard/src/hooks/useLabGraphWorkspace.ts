import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { runLabGraphPlan, streamSignals, type LabGraphSignalRow } from '../services/labGraphOrchestratorService';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';

type WorkspaceAction =
  | { type: 'reset' }
  | { type: 'load-start' }
  | { type: 'load-success'; payload: { runId: string; completed: number; total: number; telemetryCount: number } }
  | { type: 'load-fail'; payload: string }
  | { type: 'signal-batch'; payload: readonly LabGraphSignalRow[] };

interface WorkspaceState {
  readonly tenant: string;
  readonly namespace: string;
  readonly loading: boolean;
  readonly runId: string;
  readonly completed: number;
  readonly total: number;
  readonly telemetryCount: number;
  readonly signals: readonly LabGraphSignalRow[];
  readonly error?: string;
}

const initialState = (tenant: string, namespace: string): WorkspaceState => ({
  tenant,
  namespace,
  loading: false,
  runId: '',
  completed: 0,
  total: 0,
  telemetryCount: 0,
  signals: [],
});

const reducer = (state: WorkspaceState, action: WorkspaceAction): WorkspaceState => {
  switch (action.type) {
    case 'reset':
      return {
        ...state,
        loading: false,
        runId: '',
        completed: 0,
        total: 0,
        telemetryCount: 0,
        signals: [],
        error: undefined,
      };
    case 'load-start':
      return { ...state, loading: true, error: undefined };
    case 'load-success':
      return {
        ...state,
        loading: false,
        runId: action.payload.runId,
        completed: action.payload.completed,
        total: action.payload.total,
        telemetryCount: action.payload.telemetryCount,
      };
    case 'load-fail':
      return { ...state, loading: false, error: action.payload };
    case 'signal-batch':
      return {
        ...state,
        signals: [...state.signals, ...action.payload],
      };
  }
};

export const useLabGraphWorkspace = ({
  tenant,
  namespace,
  steps,
  nodes,
  edges,
  intensity,
}: {
  tenant: string;
  namespace: string;
  steps: readonly GraphStep<string>[];
  nodes: readonly { id: string; type: 'source' | 'transform' | 'merge' | 'sink'; route: string; tags: readonly string[] }[];
  edges: readonly { id: string; from: string; to: string; latencyMs: number; weight: number }[];
  intensity: 'calm' | 'elevated' | 'extreme';
}) => {
  const [state, dispatch] = useReducer(reducer, initialState(tenant, namespace));

  const runPlan = useCallback(async () => {
    dispatch({ type: 'load-start' });
    try {
      const plan = await runLabGraphPlan(tenant, namespace, {
        runId: `${tenant}-${Date.now()}`,
        intensity,
        nodes,
        edges,
        steps,
      });
      const signals = await streamSignals(steps);
      dispatch({
        type: 'load-success',
        payload: {
          runId: plan.runId,
          completed: plan.completed,
          total: plan.stepCount,
          telemetryCount: plan.telemetry.length,
        },
      });
      dispatch({ type: 'signal-batch', payload: signals });
    } catch (error) {
      dispatch({
        type: 'load-fail',
        payload: error instanceof Error ? error.message : 'run failed',
      });
    }
  }, [tenant, namespace, intensity, steps, nodes, edges]);

  useEffect(() => {
    void runPlan();
  }, [runPlan]);

  const selectedSignals = useMemo(() => state.signals.slice(-20).toReversed(), [state.signals]);
  const completion = state.total > 0 ? (state.completed / state.total) * 100 : 0;
  const warning = state.completed > state.total ? 'over-completed' : null;

  return {
    ...state,
    completion,
    runPlan,
    selectedSignals,
    warning,
    totalSteps: state.total,
    canRun: steps.length > 0 && nodes.length > 0 && edges.length >= 0,
  };
};
