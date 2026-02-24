import { useCallback, useMemo, useReducer } from 'react';
import { buildConductorWorkspaceCatalog } from '../services/conductorCatalog';
import { executeConductorWorkflow } from '../services/conductorAdapter';
import {
  type ConductorPhase,
  type ConductorPageResult,
  type ConductorStatus,
  type ConductorPhaseEntry,
  type ConductorWorkspaceSummary,
} from '../types';

type ConductorAction =
  | { type: 'set-status'; status: ConductorStatus }
  | { type: 'set-mode'; mode: string }
  | { type: 'append-timeline'; entry: ConductorPhaseEntry }
  | { type: 'set-mode-status'; mode: string; status: ConductorStatus }
  | { type: 'set-workspace'; workspace: ConductorWorkspaceSummary };

interface ConductorState {
  readonly mode: 'overview' | 'signal' | 'policy' | 'timeline';
  readonly status: ConductorStatus;
  readonly phase: ConductorPhase | null;
  readonly timeline: readonly ConductorPhaseEntry[];
  readonly workspace: ConductorWorkspaceSummary;
  readonly tenantId: string;
}

const initialStatus = (tenantId: string): ConductorState => {
  const catalog = buildConductorWorkspaceCatalog(tenantId as any);
  return {
    tenantId,
    mode: 'overview',
    status: 'idle',
    phase: null,
    timeline: [],
    workspace: {
      tenantId: tenantId as unknown as ConductorWorkspaceSummary['tenantId'],
      status: 'idle',
      runbooks: catalog.runbooks,
      signals: catalog.signals,
      plan: null,
      simulation: null,
    },
  };
};

const reducer = (state: ConductorState, action: ConductorAction): ConductorState => {
  if (action.type === 'set-status') {
    return { ...state, status: action.status };
  }
  if (action.type === 'set-mode') {
    return { ...state, mode: action.mode as ConductorState['mode'] };
  }
  if (action.type === 'set-workspace') {
    return { ...state, workspace: action.workspace };
  }
  if (action.type === 'set-mode-status') {
    return {
      ...state,
      mode: action.mode as ConductorState['mode'],
      status: action.status,
    };
  }
  return {
    ...state,
    timeline: [...state.timeline, action.entry],
  };
};

export const useRecoveryCommandConductor = (tenantId: string): ConductorPageResult => {
  const [state, dispatch] = useReducer(reducer, tenantId, initialStatus);

  const catalog = useMemo(() => buildConductorWorkspaceCatalog(tenantId as any), [tenantId]);

  const start = useCallback(async () => {
    dispatch({ type: 'set-status', status: 'preparing' });
    dispatch({
      type: 'append-timeline',
      entry: {
        phase: 'discover',
        status: 'plugin-start',
        pluginName: 'discover-signals',
        details: 'seeded workspace',
      },
    });
    dispatch({ type: 'set-status', status: 'running' });
    dispatch({
      type: 'append-timeline',
      entry: {
        phase: 'assess',
        status: 'plugin-progress',
        pluginName: 'assess-dependencies',
        details: 'dependency graph loaded',
      },
    });

    const diagnostics = await executeConductorWorkflow(tenantId as any, catalog.runbooks as any, catalog.signals as any);
    dispatch({ type: 'set-status', status: 'succeeded' });
    dispatch({
      type: 'append-timeline',
      entry: {
        phase: 'finalize',
        status: 'plugin-complete',
        pluginName: 'finalize-summary',
        details: `diagnostics=${diagnostics.length}`,
      },
    });
  }, [catalog.runbooks, catalog.signals, tenantId]);

  const stop = useCallback(() => {
    dispatch({ type: 'set-status', status: 'failed' });
  }, []);

  const reset = useCallback(() => {
    dispatch({
      type: 'set-mode-status',
      mode: 'overview',
      status: 'idle',
    });
  }, []);

  return {
    state: {
      mode: state.mode,
      status: state.status,
      phase: state.phase,
      timeline: state.timeline,
      workspace: state.workspace,
    },
    actions: {
      start,
      stop,
      reset,
    },
  };
};
