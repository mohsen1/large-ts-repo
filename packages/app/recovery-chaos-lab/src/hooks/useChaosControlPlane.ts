import { useCallback, useMemo, useState } from 'react';
import {
  ChaosControlPlaneService,
  type ControlPlaneConfig,
  type ControlPlaneResult,
  resolveControlPlan
} from '../services/chaosControlPlane';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

export interface ChaosControlPlaneHookState {
  readonly loading: boolean;
  readonly lastResult: ControlPlaneResult | null;
  readonly error: string | null;
  readonly windowMs: number;
  readonly namespace: string;
}

const EMPTY_SCENARIO = {
  id: '00000000-0000-0000-0000-000000000000',
  stages: [] as readonly StageBoundary<string, unknown, unknown>[]
};

export function useChaosControlPlane(config: Omit<ControlPlaneConfig, 'scenarioId' | 'simulationId'>) {
  const [state, setState] = useState<ChaosControlPlaneHookState>({
    loading: false,
    lastResult: null,
    error: null,
    windowMs: config.windowMs,
    namespace: config.namespace
  });

  const service = useMemo(() => new ChaosControlPlaneService(), []);

  const run = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const plan = await resolveControlPlan(config);
      const result = await service.run(
        config,
        EMPTY_SCENARIO,
        {
          get: () =>
            ({
              plugin: 'noop',
              execute: async () => ({ ok: true, value: undefined })
            }) as never
        }
      );
      setState((prev) => ({
        ...prev,
        loading: false,
        lastResult: result,
        namespace: config.namespace,
        windowMs: plan.windowMs
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(error)
      }));
    }
  }, [config, service]);

  const reset = useCallback(() => {
    setState({
      loading: false,
      lastResult: null,
      error: null,
      windowMs: state.windowMs,
      namespace: config.namespace
    });
  }, [config.namespace, state.windowMs]);

  return useMemo(
    () => ({
      ...state,
      run,
      reset
    }),
    [run, reset, state]
  );
}
