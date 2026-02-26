import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { ObservatoryFacade, ObservabilitySummary } from '@service/recovery-horizon-observability-orchestrator';
import {
  collectDefaultPulse,
  createObservabilityFacade,
  runObservabilityPulse,
  type ObservabilityPulseInput,
  type ObservabilityPulseResult,
} from '@service/recovery-horizon-observability-orchestrator';

type ObservatoryProfile = 'default' | 'high-fidelity' | 'streaming' | 'batch';

interface ObservationState {
  readonly tenantId: string;
  readonly stageWindow: readonly string[];
  readonly owner: string;
  readonly profile: ObservatoryProfile;
  readonly refreshMs: number;
  readonly busy: boolean;
  readonly summaries: readonly ObservabilitySummary[];
  readonly latest?: {
    readonly runId: string;
    readonly elapsedMs: number;
    readonly trace: readonly string[];
    readonly summary: ObservabilitySummary;
  };
  readonly profilePool: readonly ObservatoryProfile[];
  readonly error: string | null;
  readonly facadeReady: boolean;
}

interface ObservatoryAction {
  readonly type:
    | 'set-tenant'
    | 'set-owner'
    | 'set-profile'
    | 'set-refresh'
    | 'toggle-stage'
    | 'set-busy'
    | 'set-error'
    | 'set-latest'
    | 'set-facade'
    | 'append-summary';
  readonly tenantId?: string;
  readonly owner?: string;
  readonly profile?: ObservatoryProfile;
  readonly refreshMs?: number;
  readonly stage?: string;
  readonly value?: boolean;
  readonly error?: string | null;
  readonly result?: ObservabilityPulseResult;
}

const initialState: ObservationState = {
  tenantId: 'tenant-001',
  stageWindow: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  owner: 'console',
  profile: 'default',
  refreshMs: 1_000,
  busy: false,
  summaries: [],
  profilePool: ['default', 'high-fidelity', 'streaming', 'batch'],
  error: null,
  facadeReady: false,
};

const reducer = (state: ObservationState, action: ObservatoryAction): ObservationState => {
  switch (action.type) {
    case 'set-tenant':
      return { ...state, tenantId: action.tenantId ?? state.tenantId, latest: undefined };
    case 'set-owner':
      return { ...state, owner: action.owner ?? state.owner };
    case 'set-profile':
      return { ...state, profile: (action.profile ?? state.profile) };
    case 'set-refresh':
      return { ...state, refreshMs: action.refreshMs ?? state.refreshMs };
    case 'toggle-stage': {
      const candidate = action.stage;
      if (!candidate) {
        return state;
      }
      const has = state.stageWindow.includes(candidate);
      return {
        ...state,
        stageWindow: has ? state.stageWindow.filter((stage) => stage !== candidate) : [...state.stageWindow, candidate],
      };
    }
    case 'set-busy':
      return { ...state, busy: action.value ?? false };
    case 'set-error':
      return { ...state, error: action.error ?? null };
    case 'set-latest':
      if (!action.result) {
        return state;
      }
      return {
        ...state,
        latest: {
          runId: action.result.state.runId,
          elapsedMs: Number(action.result.state.startedAt),
          trace: action.result.trace,
          summary: action.result.summary,
        },
        summaries: [...state.summaries, action.result.summary].slice(-24),
        error: null,
      };
    case 'set-facade':
      return { ...state, facadeReady: true };
    case 'append-summary':
      return state;
    default:
      return state;
  }
};

const sanitizeStages = (stages: readonly string[]) =>
  stages
    .map((stage) => stage.trim().toLowerCase())
    .filter((stage, index, all) => stage.length > 0 && all.indexOf(stage) === index)
    .slice(0, 5) as readonly string[];

const makeInput = (state: ObservationState): ObservabilityPulseInput => ({
  tenantId: state.tenantId,
  stageWindow: sanitizeStages(state.stageWindow) as readonly ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  owner: state.owner,
  profile: state.profile,
  minStageCount: Math.max(1, state.stageWindow.length),
});

const safeRun = (input: ObservabilityPulseInput) => runObservabilityPulse({
  tenantId: input.tenantId,
  stages: input.stageWindow,
  owner: input.owner,
  profile: input.profile,
  minStageCount: input.minStageCount,
});

export const useHorizonObservability = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stages = useMemo(
    () => [
      'ingest',
      'analyze',
      'resolve',
      'optimize',
      'execute',
      'audit',
      'signal',
    ] as const,
    [],
  );

  const run = useCallback(async () => {
    if (state.busy || state.stageWindow.length === 0) {
      return;
    }
    dispatch({ type: 'set-busy', value: true });
    try {
      const result = await safeRun(makeInput(state));
      if (result.ok) {
        dispatch({ type: 'set-latest', result: result.value });
      } else {
        dispatch({ type: 'set-error', error: result.error.message });
      }
    } catch (error) {
      dispatch({ type: 'set-error', error: error instanceof Error ? error.message : 'observability run failed' });
    } finally {
      dispatch({ type: 'set-busy', value: false });
    }
  }, [state.busy, state.stageWindow, state.owner, state.profile, state.tenantId]);

  const refreshNow = useCallback(async () => {
    const result = await collectDefaultPulse();
    if (!result.ok) {
      dispatch({ type: 'set-error', error: result.error.message });
      return;
    }
    dispatch({ type: 'set-latest', result: result.value });
  }, []);

  useEffect(() => {
    let active = true;
    let timer = window.setInterval(() => {
      if (!active) {
        return;
      }
      void run();
    }, state.refreshMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run, state.refreshMs]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const facade: ObservatoryFacade = createObservabilityFacade();
      facade.listProfiles().then(() => {
        if (!isMounted) {
          return;
        }
        dispatch({ type: 'set-facade' });
      });
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    tenantId: state.tenantId,
    owner: state.owner,
    profile: state.profile,
    refreshMs: state.refreshMs,
    busy: state.busy,
    stageWindow: sanitizeStages(state.stageWindow),
    latest: state.latest,
    summaries: state.summaries,
    stages,
    availableProfiles: state.profilePool,
    error: state.error,
    facadeReady: state.facadeReady,
    setTenant: (tenantId: string) => dispatch({ type: 'set-tenant', tenantId }),
    setOwner: (owner: string) => dispatch({ type: 'set-owner', owner }),
    setProfile: (profile: ObservatoryProfile) => dispatch({ type: 'set-profile', profile }),
    setRefreshMs: (refreshMs: number) => dispatch({ type: 'set-refresh', refreshMs }),
    setStage: (stage: string) => dispatch({ type: 'toggle-stage', stage }),
    run,
    refreshNow,
  };
};
