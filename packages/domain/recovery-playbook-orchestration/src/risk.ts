import type { OrchestrationOutcome, OrchestrationPlan, ReadinessBand, DriftSignal } from './types';

const clamp = (value: number, min = 0, max = 1): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const scoreFromSignals = (signals: readonly DriftSignal[]): number => {
  if (signals.length === 0) {
    return 1;
  }

  const weightBySeverity: Record<DriftSignal['severity'], number> = {
    low: 0.05,
    medium: 0.15,
    high: 0.35,
    critical: 0.75,
  };

  const score = signals.reduce((acc, signal) => acc + weightBySeverity[signal.severity] * signal.confidence, 0);
  return clamp(1 - score / signals.length);
};

export const bandFromScore = (score: number): ReadinessBand => {
  if (score >= 0.78) {
    return 'green';
  }
  if (score >= 0.5) {
    return 'amber';
  }
  return 'red';
};

export const inferOutcome = (plan: OrchestrationPlan, signals: readonly DriftSignal[]): OrchestrationOutcome => {
  const base = scoreFromSignals(signals);
  const passThreshold = plan.trace.length > 0 ? 0.6 : 0.4;
  const success = base >= passThreshold;
  const red = signals.filter((signal) => signal.severity === 'critical' || signal.severity === 'high').length;
  const amber = signals.filter((signal) => signal.severity === 'medium').length;
  const green = signals.filter((signal) => signal.severity === 'low').length;

  return {
    id: `outcome-${plan.id}`,
    planId: plan.id,
    finalBand: bandFromScore(base),
    success,
    durationMinutes: Math.max(0, plan.trace.length * 4),
    traces: [...plan.trace],
    telemetrySnapshot: {
      windowStart: plan.window.start,
      scores: {
        green,
        amber,
        red,
      },
      trend: success ? 'up' : signals.length > 0 ? 'down' : 'flat',
    },
  };
};

export const canPublish = (outcome: OrchestrationOutcome): boolean => {
  if (!outcome.success) {
    return false;
  }
  if (outcome.telemetrySnapshot.scores.red > 0) {
    return false;
  }
  return outcome.durationMinutes <= 240;
};
