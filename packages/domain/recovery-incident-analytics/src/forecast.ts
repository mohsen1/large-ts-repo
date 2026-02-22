import type { SignalForecastPoint, SignalCluster } from './types';

export interface ForecastInput {
  readonly cluster: SignalCluster;
  readonly lookaheadMinutes: number;
}

export interface ForecastResult {
  readonly clusterId: string;
  readonly points: readonly SignalForecastPoint[];
  readonly slope: number;
}

const normalizeStep = (lookaheadMinutes: number): number => {
  if (!Number.isFinite(lookaheadMinutes) || lookaheadMinutes <= 0) {
    return 15;
  }
  return Math.max(5, Math.min(60 * 24, Math.floor(lookaheadMinutes)));
};

export const buildSignalProjection = (input: ForecastInput): ForecastResult => {
  const step = normalizeStep(input.lookaheadMinutes);
  const points: SignalForecastPoint[] = [];
  const baseline = input.cluster.trend.map((entry) => entry.avgMagnitude);
  const safeBaseline = baseline.length > 0 ? baseline : [0.05];

  for (let index = 0; index < input.lookaheadMinutes / 5; index += 1) {
    const current = safeBaseline[index % safeBaseline.length];
    const dampen = 1 - index / Math.max(1, input.lookaheadMinutes / 5);
    const projected = Number(Math.min(1, current * dampen + Math.max(0.03, 0.1 * input.cluster.confidence)).toFixed(4));
    const riskBand = projected > 0.75 ? 'critical' : projected > 0.5 ? 'high' : projected > 0.2 ? 'moderate' : 'low';
    points.push({
      windowStart: new Date(Date.now() + index * step * 1000 * 60).toISOString(),
      projectedMagnitude: projected,
      projectedRiskBand: riskBand,
    });
  }

  const slope = points.length <= 1 ? 0 : Number((points.at(-1)!.projectedMagnitude - points[0].projectedMagnitude) / points.length);
  return {
    clusterId: input.cluster.id,
    points,
    slope: Number(slope.toFixed(4)),
  };
};
