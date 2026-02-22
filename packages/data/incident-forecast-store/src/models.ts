import type { SignalObservation, IncidentForecastPlan, ForecastMetrics, ForecastRecord } from '@domain/incident-forecasting';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

export interface ForecastDocument {
  readonly id: string;
  readonly tenantId: string;
  readonly signalCount: number;
  readonly createdAt: string;
  readonly metric: ForecastMetrics;
  readonly plan: IncidentForecastPlan;
  readonly signals: SignalObservation[];
}

export const makeForecastDocument = (
  plan: IncidentForecastPlan,
  metric: ForecastMetrics,
  signals: readonly SignalObservation[],
): Result<ForecastDocument, Error> => {
  if (metric.score < 0 || metric.score > 100) {
    return fail(new Error('Invalid score'));
  }

  const record: ForecastDocument = {
    id: `${plan.planId}:${Date.now()}`,
    tenantId: plan.tenantId,
    signalCount: signals.length,
    createdAt: new Date().toISOString(),
    metric,
    plan,
    signals: [...signals],
  };

  return ok(record);
};

export const toForecastRecord = (document: ForecastDocument): ForecastRecord => ({
  incident: document.plan,
  metrics: document.metric,
  state: {
    context: document,
    activePhase: 'ready',
    updatedAt: new Date().toISOString(),
  },
  affectedDependencies: [],
});
