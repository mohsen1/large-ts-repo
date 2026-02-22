import { buildTriage, TriageDecision } from '@domain/recovery-intelligence/src';
import type { RecoveryForecast, RecoverySignalBundle } from '@domain/recovery-intelligence/src';
import { clamp, roundTo } from '@domain/recovery-intelligence/src';
import { buildForecast, suggestActionsFromSignals } from '@domain/recovery-intelligence/src';

export interface EvaluationWindow {
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface RunEvaluation {
  readonly decision: TriageDecision;
  readonly window: EvaluationWindow;
}

export const evaluateReadiness = (
  bundle: RecoverySignalBundle,
  options?: { expectedMinutes?: number },
): RunEvaluation => {
  const forecast = buildForecast(bundle, options?.expectedMinutes ?? 12);
  const actionPlan = suggestActionsFromSignals(bundle);
  const decision = buildTriage({
    bundle,
    forecast,
    availableActions: actionPlan,
    maxActions: 6,
  });
  return {
    decision,
    window: {
      startedAt: forecast.context.startedAt,
      endedAt: new Date(Date.parse(forecast.context.startedAt) + Math.ceil(forecast.meanRecoveryMinutes) * 60_000).toISOString(),
    },
  };
};

export const normalizeDecision = (decision: RunEvaluation['decision']): number =>
  roundTo(clamp(decision.urgencyScore + (decision.status === 'abort' ? 0.15 : 0), 0, 1), 4);
