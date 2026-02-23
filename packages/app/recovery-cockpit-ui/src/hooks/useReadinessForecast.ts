import { useMemo } from 'react';
import { ReadinessWindow, RecoveryPlan, toTimestamp } from '@domain/recovery-cockpit-models';

export type ReadinessPoint = {
  label: string;
  value: number;
  delta: number;
};

export type ForecastMode = 'optimistic' | 'balanced' | 'conservative';

export const useReadinessForecast = (plan: RecoveryPlan | undefined, mode: ForecastMode): ReadinessPoint[] => {
  return useMemo(() => {
    if (!plan) {
      return [];
    }

    const windows: ReadinessWindow[] = plan.actions.map((action, index) => ({
      at: toTimestamp(new Date(Date.now() + index * 5 * 60 * 1000)),
      score: 100 - index * 3,
      services: [action.serviceCode],
      expectedRecoveryMinutes: action.expectedDurationMinutes,
    }));

    let drift = 0;
    return windows.map((window, index) => {
      const multiplier = mode === 'optimistic' ? 0.75 : mode === 'conservative' ? 1.5 : 1;
      const base = Math.max(0, window.score - window.expectedRecoveryMinutes / multiplier);
      const value = Number(base.toFixed(1));
      const delta = index === 0 ? 0 : value - (drift || 0);
      drift = value;
      return {
        label: new Date(window.at).toISOString(),
        value,
        delta,
      };
    });
  }, [plan, mode]);
};
