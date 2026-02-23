import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { buildPolicySignature, PlanPolicySignature } from '@domain/recovery-cockpit-workloads';

export type CockpitTelemetryRecord = {
  readonly planId: string;
  readonly planMode: RecoveryPlan['mode'];
  readonly forecast: number;
  readonly policy: PlanPolicySignature;
  readonly slaHealth: 'good' | 'watch' | 'alert';
  readonly generatedAt: string;
};

const classifySlaHealth = (summary: number): 'good' | 'watch' | 'alert' => {
  if (summary >= 90) return 'good';
  if (summary >= 60) return 'watch';
  return 'alert';
};

export const buildCockpitTelemetryRecord = (plan: RecoveryPlan): CockpitTelemetryRecord => {
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  const policy = buildPolicySignature(plan);

  return {
    planId: plan.planId,
    planMode: plan.mode,
    forecast: forecast.summary,
    policy,
    slaHealth: classifySlaHealth(forecast.summary),
    generatedAt: new Date().toISOString(),
  };
};

export const telemetryForWorkspace = (plans: readonly RecoveryPlan[]): CockpitTelemetryRecord[] => {
  return plans.map((plan) => buildCockpitTelemetryRecord(plan));
};

export const telemetryBatchSignature = (records: readonly CockpitTelemetryRecord[]): string => {
  return records
    .map((record) => `${record.planId}:${record.slaHealth}:${record.forecast.toFixed(2)}`)
    .join('|');
};
