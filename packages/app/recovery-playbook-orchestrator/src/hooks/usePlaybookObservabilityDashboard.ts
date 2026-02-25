import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  runDashboardScenario,
  createDashboard,
  type OrchestratorCommand,
  type OrchestrationSessionResult,
} from '@service/recovery-playbook-observability-orchestrator';
import type { ObservabilityScope } from '@domain/recovery-playbook-observability-core';
import type { Result } from '@shared/result';

export interface PolicyFilterState {
  readonly scope: ObservabilityScope;
  readonly showForecast: boolean;
  readonly maxEvents: number;
}

const initialPolicyState: PolicyFilterState = {
  scope: 'playbook',
  showForecast: true,
  maxEvents: 16,
};

export interface UseObservabilityDashboardResult {
  readonly state: {
    readonly command: OrchestratorCommand;
    readonly policy: (OrchestratorCommand & { readonly maxEvents: number; readonly showForecast: boolean }) | undefined;
    readonly result?: OrchestrationSessionResult;
    readonly loaded: boolean;
    readonly loading: boolean;
    readonly error: readonly string[];
  };
  readonly run: () => Promise<Result<OrchestrationSessionResult, string>[]>;
  readonly refresh: () => void;
  readonly setScope: (scope: ObservabilityScope) => void;
  readonly setMaxEvents: (maxEvents: number) => void;
  readonly toggleForecast: () => void;
}

type DashboardAction =
  | { type: 'running' }
  | {
      type: 'loaded';
      command: OrchestratorCommand;
      policy: OrchestratorCommand & { readonly maxEvents: number; readonly showForecast: boolean };
      result: OrchestrationSessionResult;
    }
  | { type: 'error'; error: string }
  | { type: 'reset' };

interface DashboardState {
  readonly command: OrchestratorCommand;
  readonly policy: (OrchestratorCommand & { readonly maxEvents: number; readonly showForecast: boolean }) | undefined;
  readonly result: OrchestrationSessionResult | undefined;
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly error: readonly string[];
}

const reducer = (state: DashboardState, action: DashboardAction): DashboardState => {
  switch (action.type) {
    case 'running':
      return { ...state, loading: true };
    case 'loaded':
      return {
        ...state,
        loading: false,
        loaded: true,
        command: action.command,
        policy: action.policy,
        result: action.result,
      };
    case 'error':
      return {
        ...state,
        loading: false,
        error: [...state.error, action.error],
      };
    case 'reset':
      return {
        ...state,
        loaded: false,
        loading: false,
        result: undefined,
        error: [],
      };
    default:
      return state;
  }
};

export const usePlaybookObservabilityDashboard = (seed: { readonly tenantId: string; readonly playbook: string }): UseObservabilityDashboardResult => {
  const [state, dispatch] = useReducer(reducer, {
    command: {
      tenantId: seed.tenantId,
      playbook: seed.playbook,
      scopes: [initialPolicyState.scope],
    },
    policy: undefined,
    result: undefined,
    loaded: false,
    loading: false,
    error: [],
  });

  const commandRef = useRef(state.command);
  const policyRef = useRef(initialPolicyState);
  commandRef.current = state.command;

  const setPolicy = useCallback((updater: (state: PolicyFilterState) => PolicyFilterState) => {
    policyRef.current = updater(policyRef.current);
    dispatch({ type: 'reset' });
  }, []);

  const run = useCallback(async () => {
    dispatch({ type: 'running' });
    const command = {
      ...commandRef.current,
      scopes: [policyRef.current.scope],
    };

    const dashboard = createDashboard(command);
    if (!dashboard.ok) {
      dispatch({ type: 'error', error: dashboard.error });
      return [dashboard] as Result<OrchestrationSessionResult, string>[];
    }

    const scenario = await runDashboardScenario(dashboard.value.command);
    if (!scenario.ok) {
      dispatch({ type: 'error', error: scenario.error });
      return [scenario] as Result<OrchestrationSessionResult, string>[];
    }

    dispatch({
      type: 'loaded',
      command: scenario.value
        ? dashboard.value.command
        : command,
      policy: {
        ...command,
        maxEvents: policyRef.current.maxEvents,
        showForecast: policyRef.current.showForecast,
      },
      result: scenario.value,
    });

    return [scenario] as Result<OrchestrationSessionResult, string>[];
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const setScope = useCallback((scope: ObservabilityScope) => {
    const nextCommand = { ...commandRef.current, scopes: [scope] };
    commandRef.current = nextCommand;
    setPolicy(() => ({ ...policyRef.current, scope }));
  }, [setPolicy]);

  const setMaxEvents = useCallback((maxEvents: number) => {
    setPolicy(() => ({
      ...policyRef.current,
      maxEvents: Math.max(4, Math.min(128, maxEvents)),
    }));
  }, [setPolicy]);

  const toggleForecast = useCallback(() => {
    setPolicy((next) => ({ ...next, showForecast: !next.showForecast }));
  }, [setPolicy]);

  const refresh = useCallback(() => {
    dispatch({ type: 'reset' });
    void run();
  }, [run]);

  return {
    state: {
      command: commandRef.current,
      policy: state.policy,
      result: state.result,
      loaded: state.loaded,
      loading: state.loading,
      error: state.error,
    },
    run,
    refresh,
    setScope,
    setMaxEvents,
    toggleForecast,
  };
};
