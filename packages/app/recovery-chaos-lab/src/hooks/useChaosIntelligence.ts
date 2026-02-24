import { useEffect, useMemo, useReducer } from 'react';
import {
  startStudioSession,
  loadStudioScope,
  type ChaosStudioSession,
  type ChaosStudioSessionConfig
} from '../services/chaosStudioRuntime';
import { loadBlueprint } from '../services/chaosRuntime';
import { fail, type Result } from '@shared/result';
import type { ChaosRunEvent, ChaosRunReport, StageBoundary } from '@service/recovery-chaos-orchestrator';

export interface UseChaosIntelligenceState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly session: ChaosStudioSession | null;
  readonly events: readonly ChaosRunEvent[];
  readonly latestProgress: number;
  readonly latestRuntimeReport: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]> | null;
  readonly error: Error | null;
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; session: ChaosStudioSession }
  | { type: 'failed'; error: Error }
  | { type: 'reset' };

type Factory = {
  readonly stage: string;
  readonly execute: (input: unknown) => Promise<unknown>;
};

const starterState: UseChaosIntelligenceState = {
  status: 'idle',
  session: null,
  events: [],
  latestProgress: 0,
  latestRuntimeReport: null,
  error: null
};

function reducer(state: UseChaosIntelligenceState, action: Action): UseChaosIntelligenceState {
  switch (action.type) {
    case 'loading':
      return { ...starterState, status: 'loading' };
    case 'loaded':
      return {
        status: 'ready',
        session: action.session,
        events: action.session.events,
        latestProgress: action.session.report.progress,
        latestRuntimeReport: action.session.report,
        error: null
      };
    case 'failed':
      return {
        status: 'error',
        session: null,
        events: [],
        latestProgress: 0,
        latestRuntimeReport: null,
        error: action.error
      };
    case 'reset':
      return starterState;
    default:
      return state;
  }
}

async function loadSession(
  config: ChaosStudioSessionConfig
): Promise<Result<ChaosStudioSession>> {
  const scenario = await loadBlueprint(config.namespace, config.scenarioId);
  const scope = loadStudioScope();
  const factories: Factory[] = scenario.stages.map((stage) => ({
    stage: stage.name,
    execute: async () => ({
      ok: true
    })
  }));

  const normalized = {
    namespace: String(scope.namespace),
    scenarioId: String(scope.scenarioId),
    options: config.options
  };
  return startStudioSession(
    normalized,
    scenario as never,
    factories as never,
    config.options
  );
}

export function useChaosIntelligence(config: ChaosStudioSessionConfig) {
  const [state, dispatch] = useReducer(reducer, starterState);

  useEffect(() => {
    let alive = true;
    dispatch({ type: 'loading' });
    void (async () => {
      const result = await loadSession(config);
      if (!alive) {
        return;
      }
      if (result.ok) {
        dispatch({ type: 'loaded', session: result.value });
        return;
      }
      dispatch({ type: 'failed', error: result.error as Error });
    })();
    return () => {
      alive = false;
      dispatch({ type: 'reset' });
    };
  }, [config.namespace, config.scenarioId, config.options]);

  const summary = useMemo(() => {
    const eventByKind = new Map<string, number>();
    for (const event of state.events) {
      eventByKind.set(event.kind, (eventByKind.get(event.kind) ?? 0) + 1);
    }
    const eventMix = [...eventByKind.entries()].map(([kind, count]) => ({ kind, count }));
    return {
      eventMix,
      hasErrors: state.error !== null,
      ready: state.status === 'ready',
      progress: state.latestProgress
    };
  }, [state.error, state.events, state.status, state.latestProgress]);

  return {
    ...state,
    summary,
    refresh: () => {
      dispatch({ type: 'loading' });
      void loadSession(config).then((result) => {
        dispatch(result.ok ? { type: 'loaded', session: result.value } : { type: 'failed', error: result.error as Error });
      });
    }
  } as const;
}
