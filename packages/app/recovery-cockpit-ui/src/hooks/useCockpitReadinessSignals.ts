import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { buildReadinessProfile, ServiceReadinessProfile, mergeProfiles } from '@domain/recovery-cockpit-workloads';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';

export type SignalSnapshot = {
  readonly planId: string;
  readonly readiness: number;
  readonly forecast: number;
  readonly policy: string;
  readonly profile: ServiceReadinessProfile;
};

export const useCockpitReadinessSignals = (plans: readonly RecoveryPlan[]) => {
  const [snapshots, setSnapshots] = useState<ReadonlyArray<SignalSnapshot>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const store = useMemo(() => new InMemoryCockpitStore(), []);

  const recompute = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const profiles = plans.map((plan) => buildReadinessProfile(plan));
      const mergedProfiles = mergeProfiles(profiles);
      const mergedByPlan = new Map<string, ServiceReadinessProfile>(mergedProfiles.map((item) => [item.planId, item]));

      for (const profile of mergedProfiles) {
        const plan = plans.find((candidate) => candidate.planId === profile.planId);
        if (!plan) {
          continue;
        }
        const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
        const readiness = mergedByPlan.get(plan.planId) ?? buildReadinessProfile(plan);
        const runs = await store.listRuns(plan.planId);
        const readinessEnvelope = readiness.mean;
        if (runs.ok) {
          setSnapshots((current) => [
            ...current.filter((entry) => entry.planId !== profile.planId),
            {
              planId: plan.planId,
              readiness: readinessEnvelope,
              forecast: forecast.summary,
              policy: profile.windows.at(-1)?.band ?? 'stable',
              profile: readiness,
            },
          ]);
        }
      }
    } catch (currentError) {
      setError((currentError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [plans, store]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  return {
    snapshots,
    loading,
    error,
    refresh: recompute,
  };
};
