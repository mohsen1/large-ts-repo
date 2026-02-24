import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  buildRuntimeScope,
  runChaosSession,
  type ChaosLabSessionConfig,
  type ChaosLabSessionResult
} from '../services/chaosRuntime';
import { useChaosPluginRegistry } from './useChaosRegistry';
import { type ChaosRunEvent, type ChaosRunReport, type StageBoundary } from '@service/recovery-chaos-orchestrator';
import type { ChaosScenarioDefinition } from '@domain/recovery-chaos-lab';
import { loadBlueprint } from '../services/chaosRuntime';

type RuntimeStage = StageBoundary<string, unknown, unknown>;
type RuntimeScenario = ChaosScenarioDefinition & { stages: readonly RuntimeStage[] };
type RuntimeRunReport = ChaosRunReport<readonly RuntimeStage[]>;

type StageRegistryFactory = {
  readonly stage: string;
  readonly execute: (input: unknown) => Promise<unknown>;
};

type SessionState =
  | { status: 'idle'; scenario: null; report: null; events: readonly ChaosRunEvent[]; error: null }
  | {
      status: 'running';
      scenario: RuntimeScenario;
      report: null;
      events: readonly ChaosRunEvent[];
      error: null;
    }
  | {
      status: 'done';
      scenario: RuntimeScenario;
      report: RuntimeRunReport;
      events: readonly ChaosRunEvent[];
      error: null;
    }
  | {
      status: 'error';
      scenario: null;
      report: null;
      events: readonly ChaosRunEvent[];
      error: Error;
    };

type Action =
  | { type: 'start'; scenario: RuntimeScenario }
  | { type: 'complete'; scenario: RuntimeScenario; payload: ChaosLabSessionResult<readonly RuntimeStage[]> }
  | { type: 'failure'; payload: Error }
  | { type: 'reset' };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'start':
      return { status: 'running', scenario: action.scenario, report: null, events: [], error: null };
    case 'complete':
      return {
        status: 'done',
        scenario: action.scenario,
        report: action.payload.report,
        events: action.payload.events,
        error: null
      };
    case 'failure':
      return { status: 'error', scenario: null, report: null, events: [], error: action.payload };
    case 'reset':
      return { status: 'idle', scenario: null, report: null, events: [], error: null };
    default:
      return state;
  }
}

export function useChaosLabSession(
  config: ChaosLabSessionConfig,
  factories: ReadonlyArray<StageRegistryFactory>
) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'idle',
    scenario: null,
    report: null,
    events: [],
    error: null
  } as SessionState);

  const scenarioRequest = useMemo(() => loadBlueprint(config.namespace, config.scenarioId), [config.namespace, config.scenarioId]);
  const { registry } = useChaosPluginRegistry<readonly RuntimeStage[]>(factories as never);

  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [config.namespace, config.scenarioId]);

  const run = useCallback(() => {
    let cancelled = false;
    void scenarioRequest.then((scenario) => {
      if (cancelled) {
        return;
      }

      const normalized = scenario as RuntimeScenario;
      dispatch({ type: 'start', scenario: normalized });
      const session = buildRuntimeScope(normalized, registry);
      void runChaosSession(session, {
        ...config.options
      }).then((result) => {
        if (cancelled) {
          return;
        }
        dispatch({ type: 'complete', scenario: normalized, payload: result });
      });
    })
    .catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      dispatch({ type: 'failure', payload: error as Error });
    });

    return () => {
      cancelled = true;
    };
  }, [config.options, registry, scenarioRequest]);

  return useMemo(
    () => ({
      state,
      run,
      stop: () => undefined,
      isRunning: state.status === 'running'
    }),
    [state, run]
  );
}
