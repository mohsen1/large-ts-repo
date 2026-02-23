import type { LabStep, LabPlan, OrchestrationLab } from './types';

export interface ForecastPoint {
  readonly timestamp: string;
  readonly scenario: string;
  readonly score: number;
}

export interface PlanWindowForecast {
  readonly planId: LabPlan['id'];
  readonly labId: OrchestrationLab['id'];
  readonly expectedFinishAt: string;
  readonly confidenceTrend: readonly number[];
  readonly projectedRisk: number;
}

export interface RecoveryForecast {
  readonly generatedAt: string;
  readonly labId: OrchestrationLab['id'];
  readonly signalForecast: readonly ForecastPoint[];
  readonly planForecasts: readonly PlanWindowForecast[];
  readonly recommendation: 'go-no-go' | 'hold' | 'reconfigure';
}

const clampRatio = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeSignal = (score: number): number => clampRatio(Math.round((score / 100) * 100) / 100);

const predictPlanFinish = (plan: LabPlan, nowIso: string): string => {
  const now = Date.parse(nowIso);
  const expectedMinutes = plan.steps.reduce((acc, step) => acc + step.expectedMinutes, 0);
  const normalized = expectedMinutes > 0 ? expectedMinutes : plan.steps.length * 3;
  return new Date(now + normalized * 60 * 1000).toISOString();
};

const stepRisk = (step: LabStep): number => {
  const base = step.risk >= 0 ? step.risk : 0;
  const reversibleBoost = step.reversible ? -0.2 : 0.25;
  const ownerPenalty = step.owner === 'automated' ? -0.1 : 0;
  return clampRatio(base / 10 + reversibleBoost + ownerPenalty);
};

export const forecastSignalDecay = (lab: OrchestrationLab, horizonHours: number): readonly ForecastPoint[] => {
  const points = Math.max(1, Math.min(24, Math.floor(horizonHours)));
  return [...Array(points).keys()].map((offset) => {
    const ageMs = offset * 60 * 60 * 1000;
    const timestamp = new Date(Date.now() + ageMs).toISOString();
    const averageSignal = lab.signals.length === 0
      ? 0
      : lab.signals.reduce((acc, signal) => acc + signal.score, 0) / lab.signals.length;
    const score = normalizeSignal(
      Math.max(0, averageSignal * (1 - offset / (points * 1.2)) + lab.plans.length),
    );
    return {
      timestamp,
      scenario: lab.scenarioId,
      score,
    };
  });
};

export const forecastPlanReadiness = (lab: OrchestrationLab): readonly PlanWindowForecast[] => lab.plans.map((plan) => {
  const confidenceTrend = plan.steps.map((step) => {
    const normalized = 0.9 + (step.expectedMinutes % 9) / 90;
    return normalizeSignal(plan.confidence * 100 * normalized);
  });

  const stepRiskTotal = plan.steps.reduce((acc, step) => acc + stepRisk(step), 0);
  const projectedRisk = clampRatio(stepRiskTotal / Math.max(1, plan.steps.length));

  return {
    planId: plan.id,
    labId: lab.id,
    expectedFinishAt: predictPlanFinish(plan, plan.updatedAt),
    confidenceTrend,
    projectedRisk,
  };
});

export const planReadinessDelta = (plan: LabPlan, nowIso: string): number => {
  const forecast = forecastPlanReadiness({
    id: plan.labId,
    scenarioId: 'none',
    tenantId: 'tenant',
    incidentId: 'incident',
    title: 'ad-hoc',
    signals: [],
    windows: [],
    plans: [plan],
    createdAt: nowIso,
    updatedAt: nowIso,
  } as unknown as OrchestrationLab);
  const active = forecast[0];
  if (!active) {
    return 0;
  }
  const tail = active.confidenceTrend.at(-1) ?? plan.confidence;
  const head = active.confidenceTrend[0] ?? plan.confidence;
  return Number((tail - head).toFixed(3));
};

export const buildRecoveryForecast = (lab: OrchestrationLab, horizonHours: number): RecoveryForecast => {
  const signalForecast = forecastSignalDecay(lab, horizonHours);
  const planForecasts = forecastPlanReadiness(lab);
  const riskAverage = planForecasts.length === 0
    ? 1
    : planForecasts.reduce((acc, entry) => acc + entry.projectedRisk, 0) / planForecasts.length;
  const recommendation =
    riskAverage > 0.72 && signalForecast.some((point) => point.score < 0.3)
      ? 'reconfigure'
      : signalForecast[signalForecast.length - 1]?.score ?? 0 > 0.6
        ? 'go-no-go'
        : 'hold';

  return {
    generatedAt: new Date().toISOString(),
    labId: lab.id,
    signalForecast,
    planForecasts,
    recommendation,
  };
};

export const summarizeForecast = (forecast: RecoveryForecast): string => {
  const topPlan = forecast.planForecasts.at(0);
  const topRisk = forecast.planForecasts.length === 0
    ? 0
    : Math.max(...forecast.planForecasts.map((entry) => entry.projectedRisk));
  const finalSignal = forecast.signalForecast.at(-1)?.score ?? 0;
  return `${forecast.recommendation} · plan-risk=${topRisk.toFixed(2)} · signal=${finalSignal.toFixed(2)} · plan=${
    topPlan ? topPlan.planId : 'none'
  }`;
};
