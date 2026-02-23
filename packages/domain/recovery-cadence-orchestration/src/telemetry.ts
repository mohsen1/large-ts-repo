import type { CadencePlan, CadenceWindow, CadenceWindowForecast } from './types';

export interface TelemetryEvent {
  readonly key: string;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'score' | 'ratio';
  readonly emittedAt: string;
}

export interface TelemetryProfile {
  readonly planId: CadencePlan['id'];
  readonly events: readonly TelemetryEvent[];
  readonly generatedAt: string;
}

export interface WindowObservation {
  readonly windowId: CadenceWindow['id'];
  readonly queueDepth: number;
  readonly activeSinceMs: number;
}

export const buildWindowObservations = (
  windows: readonly CadenceWindow[],
  forecasts: readonly CadenceWindowForecast[],
): readonly WindowObservation[] => {
  return windows.map((window) => ({
    windowId: window.id,
    queueDepth: window.leadMinutes + window.lagMinutes,
    activeSinceMs: Date.parse(window.updatedAt),
  }));
};

const deriveScore = (riskScore: number): number => {
  return Math.min(1, Math.max(0, 1 - riskScore));
};

export const buildTelemetry = (plan: CadencePlan): TelemetryProfile => {
  const forecastRisk = plan.windows
    .flatMap((window) => window.id)
    .length === 0
    ? 0.15
    : plan.windows.reduce((sum, window, index) => {
      const windowWeight = index + 1;
      return sum + (window.risk === 'critical' ? 0.9 : window.risk === 'significant' ? 0.7 : window.risk === 'elevated' ? 0.4 : 0.15) * windowWeight;
    }, 0) / Math.max(1, plan.windows.length);

  const events: TelemetryEvent[] = [
    {
      key: 'plan.window_count',
      value: plan.windows.length,
      unit: 'count',
      emittedAt: new Date().toISOString(),
    },
    {
      key: 'plan.estimated_reliability',
      value: Number(deriveScore(forecastRisk).toFixed(4)),
      unit: 'ratio',
      emittedAt: new Date().toISOString(),
    },
    {
      key: 'plan.lead_minutes_total',
      value: plan.windows.reduce((total, candidate) => total + candidate.leadMinutes, 0),
      unit: 'ms',
      emittedAt: new Date().toISOString(),
    },
  ];

  return {
    planId: plan.id,
    events,
    generatedAt: new Date().toISOString(),
  };
};

export const estimateProcessingLoad = (observations: readonly WindowObservation[]): number => {
  const sumDepth = observations.reduce((sum, observation) => sum + observation.queueDepth, 0);
  return observations.length === 0 ? 0 : Number((sumDepth / observations.length).toFixed(2));
};
