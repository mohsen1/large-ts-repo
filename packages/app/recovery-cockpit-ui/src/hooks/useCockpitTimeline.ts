import { useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';

export type CockpitTimelineState = {
  mode: 'aggressive' | 'balanced' | 'conservative';
  summary: number;
  windows: number;
};

export const useCockpitTimeline = (plan: RecoveryPlan | undefined) =>
  useMemo(() => {
    if (!plan) {
      return {
        mode: 'balanced' as const,
        summary: 0,
        windows: 0,
      };
    }
    const forecast = buildPlanForecast(plan, 'balanced');
    return {
      mode: 'balanced' as const,
      summary: forecast.summary,
      windows: forecast.windows.length,
    };
  }, [plan]);

export const useMultiTimeline = (plan: RecoveryPlan | undefined): readonly CockpitTimelineState[] =>
  useMemo(() => {
    if (!plan) return [];
    return [
      { mode: 'aggressive', summary: buildPlanForecast(plan, 'aggressive').summary, windows: 0 },
      { mode: 'balanced', summary: buildPlanForecast(plan, 'balanced').summary, windows: 0 },
      { mode: 'conservative', summary: buildPlanForecast(plan, 'conservative').summary, windows: 0 },
    ];
  }, [plan]);
