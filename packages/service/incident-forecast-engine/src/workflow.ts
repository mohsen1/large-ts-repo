import { evaluateRisk, forecastedDowntime, buildForecastPlan } from '@domain/incident-forecasting';
import type { SignalObservation } from '@domain/incident-forecasting';

export interface WorkflowStatus {
  readonly state: 'idle' | 'running' | 'blocked' | 'complete';
  readonly nextAction: string;
}

export const synthesizeWorkflow = (signals: readonly SignalObservation[]): WorkflowStatus => {
  const assessment = evaluateRisk(signals, []);
  const downtimeMinutes = forecastedDowntime(assessment);

  if (assessment.riskBand === 'critical' && downtimeMinutes > 120) {
    return { state: 'blocked', nextAction: 'escalate-to-wm' };
  }

  if (signals.length === 0) {
    return { state: 'idle', nextAction: 'wait-signals' };
  }

  return {
    state: downtimeMinutes > 30 ? 'running' : 'complete',
    nextAction: buildForecastPlan(
      signals[0]!.tenantId,
      signals[0]!.severity,
      signals,
    ).playbookSteps[1] ?? 'noop',
  };
};
