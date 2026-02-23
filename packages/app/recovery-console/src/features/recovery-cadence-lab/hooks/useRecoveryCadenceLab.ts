import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createRecoveryCadenceCoordinator,
  createInMemoryCadenceRuntime,
} from '@service/recovery-cadence-coordinator';
import type { CadenceCoordinatorConfig, CadenceCoordinatorError, CadenceCommandResult } from '@service/recovery-cadence-coordinator';
import type {
  CadenceIntent,
  CadencePlan,
  CadenceWindowForecast,
  CadencePlan as DomainPlan,
} from '@domain/recovery-cadence-orchestration';
import type { CadenceLabState, CadenceLabSummary } from '../types';

const baseConfig: CadenceCoordinatorConfig = {
  orgId: 'cadence-lab-org',
  owner: 'cadence-lab-console',
  timezone: 'UTC',
  maxActiveWindowCount: 3,
};

export interface UseRecoveryCadenceLabResult {
  readonly state: CadenceLabState;
  readonly summaries: CadenceLabSummary[];
  readonly actions: {
    readonly refresh: () => Promise<void>;
    readonly startPlan: (planId: DomainPlan['id']) => Promise<void>;
    readonly stopPlan: (planId: DomainPlan['id']) => Promise<void>;
  };
  readonly loading: boolean;
  readonly error?: CadenceCoordinatorError;
}

const toSummary = (plan: CadencePlan, forecastCount: number): CadenceLabSummary => ({
  planId: plan.id,
  displayName: plan.displayName,
  windowCount: plan.windows.length,
  owner: plan.owner,
  warningCount: forecastCount,
});

export const useRecoveryCadenceLab = (): UseRecoveryCadenceLabResult => {
  const coordinator = useMemo(() => createRecoveryCadenceCoordinator(baseConfig), []);
  const runtime = useMemo(() => createInMemoryCadenceRuntime({ config: baseConfig }), [coordinator]);

  const [plans, setPlans] = useState<CadencePlan[]>([]);
  const [forecasts, setForecasts] = useState<Record<CadencePlan['id'], CadenceWindowForecast[]>>({});
  const [intents, setIntents] = useState<Record<CadencePlan['id'], readonly CadenceIntent[]>>({});
  const [selectedPlanId, setSelectedPlanId] = useState<CadencePlan['id']>();
  const [status, setStatus] = useState<CadenceLabState['status']>('idle');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<CadenceCoordinatorError>();

  const hydratePlans = useCallback(async () => {
    setStatus('loading');
    setError(undefined);
    setMessage('Loading active plans from in-memory coordinator');

    const plan = await coordinator.craftPlan(baseConfig);
    if (!plan.ok) {
      setError(plan.error);
      setStatus('error');
      setMessage('Unable to craft plan in coordinator');
      return;
    }

    const storedPlans: CadencePlan[] = [plan.value];
    setPlans(storedPlans);
    const selected = storedPlans[0];
    setSelectedPlanId(selected.id);

    const forecastResult = await coordinator.forecast(selected);
    if (!forecastResult.ok) {
      setError(forecastResult.error);
      setStatus('error');
      setMessage('Unable to compute forecast');
      return;
    }

    const diagnostics = await coordinator.diagnose(selected);
    if (!diagnostics.ok) {
      setError(diagnostics.error);
      setStatus('error');
      setMessage('Unable to compute diagnostics');
      return;
    }

    const intentResult = await coordinator.collectIntents(selected.id);
    if (!intentResult.ok) {
      setError(intentResult.error);
      setStatus('error');
      return;
    }

    setForecasts((previous) => ({
      ...previous,
      [selected.id]: forecastResult.value,
    }));

    setIntents((previous) => ({
      ...previous,
      [selected.id]: intentResult.value,
    }));

    const commandResult = await runtime.execute(selected);
    if (commandResult.startsWith('error')) {
      setMessage(`Runtime bootstrap failed: ${commandResult}`);
    } else {
      setMessage(`Plan accepted by runtime (${diagnostics.value.activeRuns} active)`);
    }

    setStatus('ready');
  }, [coordinator, runtime]);

  useEffect(() => {
    void hydratePlans();
  }, [hydratePlans]);

  const startPlan = useCallback(async (planId: CadencePlan['id']) => {
    setSelectedPlanId(planId);
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) {
      setError({ code: 'not-found', message: `Plan ${planId} not found` });
      return;
    }

    const launch = await coordinator.activateWindows(plan.id, plan.windows.map((window) => window.id));
    if (!launch.ok) {
      setError(launch.error);
      return;
    }

    setMessage(`Started ${launch.value.length} windows`);
  }, [coordinator, plans]);

  const stopPlan = useCallback(async (planId: CadencePlan['id']) => {
    const shutdown = await coordinator.decommission(planId);
    if (!shutdown.ok) {
      setError(shutdown.error);
      return;
    }
    setMessage(`Stopped plan with result ${resultCode(shutdown.value)}.`);
  }, [coordinator]);

  const refresh = useCallback(async () => {
    await hydratePlans();
  }, [hydratePlans]);

  const state: CadenceLabState = {
    status,
    selectedPlanId,
    selectedWindowCount: selectedPlanId ? (plans.find((plan) => plan.id === selectedPlanId)?.windows.length ?? 0) : 0,
    plans,
    forecasts,
    intents,
    message,
  };

  const summaries = plans.map((plan) => toSummary(plan, forecasts[plan.id]?.length ?? 0));

  return {
    state,
    summaries,
    actions: {
      refresh,
      startPlan,
      stopPlan,
    },
    loading: status === 'loading',
    error,
  };
};

const resultCode = (result: CadenceCommandResult): string => (result.accepted ? 'accepted' : 'rejected');
