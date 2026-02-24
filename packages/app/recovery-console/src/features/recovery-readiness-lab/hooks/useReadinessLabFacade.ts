import { useEffect, useMemo, useState } from 'react';
import type { ReadinessLabDashboardState } from '../types';
import { buildOrderedSteps } from '../plugins';
import { useReadinessLabSignals } from './useReadinessLabSignals';

interface UseReadinessLabFacadeOptions {
  tenant: string;
  namespace: string;
}

export interface UseReadinessLabFacadeResult {
  readonly workspaceId: string;
  readonly state: ReadinessLabDashboardState;
  readonly canRun: boolean;
  readonly isRunning: boolean;
  readonly eventBus: string;
  readonly pluginCount: number;
  readonly stepLabel: string;
  readonly run: () => void | Promise<void>;
}

export const useReadinessLabFacade = ({ tenant, namespace }: UseReadinessLabFacadeOptions): UseReadinessLabFacadeResult => {
  const steps = buildOrderedSteps();
  const state = useReadinessLabSignals({ tenant, namespace, steps });
  const [lastRunLabel, setLastRunLabel] = useState('idle');

  useEffect(() => {
    if (!state.running && state.state.events.length > 0 && lastRunLabel === 'running') {
      setLastRunLabel('idle');
    }
  }, [state.running, state.state.events.length, lastRunLabel]);

  const run = async () => {
    setLastRunLabel('running');
    await state.runNow();
    setLastRunLabel(state.state.diagnostics.length ? 'completed' : 'stale');
  };

  return useMemo(
    () => ({
      workspaceId: state.state.workspaceId as string,
      state: state.state,
      canRun: state.canRun,
      isRunning: state.running,
      eventBus: `events/${tenant}`,
      pluginCount: steps.length,
      stepLabel: steps.join('→'),
      run,
    }),
    [state.running, state.canRun, state.state, tenant, steps, lastRunLabel],
  );
};
