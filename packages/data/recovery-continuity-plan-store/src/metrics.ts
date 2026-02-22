import type { ContinuityPlanRecord } from './models';

export interface ContinuitySignal {
  readonly tenantId: ContinuityPlanRecord['tenantId'];
  readonly planId: ContinuityPlanRecord['id'];
  readonly value: number;
  readonly measuredAt: string;
}

export interface ContinuityTrend {
  readonly direction: 'up' | 'down' | 'flat';
  readonly variance: number;
  readonly reason: string;
}

export const calculateSignalVariance = (
  signals: readonly ContinuitySignal[],
): number => {
  if (signals.length < 2) return 0;
  const values = signals.map((signal) => signal.value);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deltas = values.map((value) => Math.abs(value - avg));
  return deltas.reduce((sum, value) => sum + value, 0) / values.length;
};

export const summarizeTrends = (values: readonly number[]): ContinuityTrend => {
  if (values.length < 2) {
    return {
      direction: 'flat',
      variance: 0,
      reason: 'insufficient-data',
    };
  }

  const head = values[values.length - 1] ?? 0;
  const tail = values[0] ?? 0;
  const diff = head - tail;

  if (diff > 0.001) {
    return { direction: 'up', variance: diff, reason: `${head.toFixed(3)}>${tail.toFixed(3)}` };
  }

  if (diff < -0.001) {
    return { direction: 'down', variance: Math.abs(diff), reason: `${head.toFixed(3)}<${tail.toFixed(3)}` };
  }

  return { direction: 'flat', variance: Math.abs(diff), reason: `${head.toFixed(3)}=${tail.toFixed(3)}` };
};

export const deriveHealthSignal = (plan: ContinuityPlanRecord): ContinuitySignal[] => {
  const base = plan.plan.tasks.length + (plan.plan.maxConcurrentTasks ?? 0);
  const severity = plan.plan.priorityWeight * 10;
  const now = new Date().toISOString();
  return [
    {
      tenantId: plan.tenantId,
      planId: plan.id,
      value: base,
      measuredAt: now,
    },
    {
      tenantId: plan.tenantId,
      planId: plan.id,
      value: severity,
      measuredAt: now,
    },
  ];
};
