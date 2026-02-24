import { useCallback, useMemo, useReducer } from 'react';
import { AdaptivePolicy, SignalKind } from '@domain/adaptive-ops';
import { createPlaybookEngine, hydratePlaybookResult, PlaybookFilter } from '../services/playbookEngine';
import { SignalSample } from '@domain/adaptive-ops';

type HookState = {
  tenantId: string;
  preferredKinds: readonly SignalKind[];
  maxActions: number;
  historyLimit: number;
  running: boolean;
  lastError: string | null;
};

type HookAction =
  | { type: 'set-tenant'; tenantId: string }
  | { type: 'set-max'; maxActions: number }
  | { type: 'set-kinds'; kinds: readonly SignalKind[] }
  | { type: 'set-running'; running: boolean }
  | { type: 'set-error'; error: string | null };

const reducer = (state: HookState, action: HookAction): HookState => {
  switch (action.type) {
    case 'set-tenant':
      return { ...state, tenantId: action.tenantId };
    case 'set-max':
      return { ...state, maxActions: action.maxActions };
    case 'set-kinds':
      return { ...state, preferredKinds: action.kinds };
    case 'set-running':
      return { ...state, running: action.running };
    case 'set-error':
      return { ...state, lastError: action.error };
    default:
      return state;
  }
};

const initialFilter: PlaybookFilter = {
  tenantId: 'tenant-a',
  preferredKinds: ['error-rate', 'latency', 'availability', 'manual-flag'],
  maxActions: 10,
  maxForecastMinutes: 30,
};

export const useAdaptiveOpsPlaybook = () => {
  const [state, dispatch] = useReducer(reducer, {
    tenantId: initialFilter.tenantId,
    preferredKinds: initialFilter.preferredKinds as readonly SignalKind[],
    maxActions: initialFilter.maxActions,
    historyLimit: 8,
    running: false,
    lastError: null,
  });

  const engine = useMemo(() => {
    const engineInstance = createPlaybookEngine({
      tenantId: state.tenantId,
      preferredKinds: [...state.preferredKinds],
      maxActions: state.maxActions,
      maxForecastMinutes: initialFilter.maxForecastMinutes,
    });
    return engineInstance;
  }, [state.tenantId, state.preferredKinds, state.maxActions]);

  const updateTenant = useCallback((tenantId: string) => {
    dispatch({ type: 'set-tenant', tenantId });
  }, []);

  const updateKinds = useCallback((nextKinds: readonly SignalKind[]) => {
    dispatch({ type: 'set-kinds', kinds: nextKinds });
  }, []);

  const updateMaxActions = useCallback((maxActions: number) => {
    dispatch({ type: 'set-max', maxActions: Math.max(1, Math.min(50, maxActions)) });
  }, []);

  const executePlaybook = useCallback(
    async (policies: readonly AdaptivePolicy[]) => {
      dispatch({ type: 'set-running', running: true });
      dispatch({ type: 'set-error', error: null });
      try {
        const syntheticSignals: readonly SignalSample[] = [
          { kind: 'error-rate', value: 0.4, unit: 'ratio', at: new Date().toISOString() },
          { kind: 'latency', value: 300, unit: 'ms', at: new Date().toISOString() },
          { kind: 'availability', value: 99.1, unit: 'percent', at: new Date().toISOString() },
          { kind: 'manual-flag', value: 1, unit: 'flag', at: new Date().toISOString() },
        ];
        await engine.run(policies, syntheticSignals);
      } catch (error) {
        dispatch({ type: 'set-error', error: error instanceof Error ? error.message : 'failed' });
      } finally {
        dispatch({ type: 'set-running', running: false });
      }
      return hydratePlaybookResult(engine);
    },
    [engine],
  );

  const outcome = useMemo(() => hydratePlaybookResult(engine), [engine]);

  const history = useMemo(() => {
    const source = outcome ? [outcome] : [];
    return source.slice(0, state.historyLimit);
  }, [outcome, state.historyLimit]);

  return {
    tenantId: state.tenantId,
    preferredKinds: state.preferredKinds,
    maxActions: state.maxActions,
    running: state.running,
    lastError: state.lastError,
    updateTenant,
    updateKinds,
    updateMaxActions,
    executePlaybook,
    outcome,
    history,
    lastResult: hydratePlaybookResult(engine),
  };
};
