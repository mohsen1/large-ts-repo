import {
  createWindowId,
  type ForecastWindowId,
  type Recommendation,
  type StageSignal,
  type TenantId,
  type SeverityBand,
} from './models';

export interface ForecastConfig {
  readonly tenantId: TenantId;
  readonly horizonMinutes: number;
  readonly confidenceFloor: number;
  readonly jitter: number;
}

export interface ForecastPoint {
  readonly index: number;
  readonly signalId: StageSignal['signal'];
  readonly forecast: number;
  readonly confidence: number;
  readonly severity: SeverityBand;
  readonly windowId: ForecastWindowId;
}

export interface ForecastSummary {
  readonly tenantId: TenantId;
  readonly total: number;
  readonly average: number;
  readonly min: number;
  readonly max: number;
  readonly points: readonly ForecastPoint[];
}

const bootstrapConfig = await (async () => {
  const defaultWindowMinutes = Number(process.env.STRESS_FORECAST_DEFAULT_WINDOW_MINUTES ?? 30);
  const confidenceFloor = Number(process.env.STRESS_FORECAST_CONFIDENCE_FLOOR ?? 0.65);
  const jitter = Number(process.env.STRESS_FORECAST_JITTER ?? 0.14);

  return {
    defaultWindowMinutes: Number.isFinite(defaultWindowMinutes)
      ? Math.max(5, Math.min(180, Math.trunc(defaultWindowMinutes)))
      : 30,
    confidenceFloor: Number.isFinite(confidenceFloor)
      ? Math.max(0, Math.min(1, confidenceFloor))
      : 0.65,
    jitter: Number.isFinite(jitter) ? Math.max(0.01, Math.min(0.5, jitter)) : 0.14,
  };
})();

const makeWindowId = (tenantId: TenantId, index: number): ForecastWindowId => {
  return createWindowId(`${tenantId}-window-${index}`);
};

const severityForScore = (score: number): SeverityBand => {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const seededRatio = (tenantId: string, signalId: string, index: number): number => {
  let value = 2166136261 >>> 0;
  const seed = `${tenantId}:${signalId}:${index}`;

  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619) >>> 0;
  }

  return value / 0xffff_ffff;
};

export async function* forecastSignalIterator(
  signals: readonly StageSignal[],
  tenantId: TenantId,
  config: ForecastConfig,
): AsyncIterable<ForecastPoint> {
  const ordered = [...signals].toSorted((a, b) => b.score - a.score);
  let index = 0;
  const now = Date.now();

  for (const signal of ordered) {
    const ratio = seededRatio(tenantId, signal.signal, index);
    const forecastRaw = ratio * signal.score;
    const forecast = clamp(forecastRaw + Math.sin(now / (index + 1) + config.jitter) * config.jitter);
    const confidence = clamp(forecast + config.confidenceFloor / 2);

    const point: ForecastPoint = {
      index,
      signalId: signal.signal,
      forecast,
      confidence,
      severity: severityForScore(forecast),
      windowId: makeWindowId(tenantId, index),
    };

    yield point;
    index += 1;

    if (index % 7 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}

export const collectForecasts = async (
  signals: readonly StageSignal[],
  tenantId: TenantId,
): Promise<readonly ForecastPoint[]> => {
  const config: ForecastConfig = {
    tenantId,
    horizonMinutes: bootstrapConfig.defaultWindowMinutes,
    confidenceFloor: bootstrapConfig.confidenceFloor,
    jitter: bootstrapConfig.jitter,
  };

  const points: ForecastPoint[] = [];
  for await (const point of forecastSignalIterator(signals, tenantId, config)) {
    points.push(point);
  }

  return points;
};

export const buildForecastSummary = async (
  tenantId: TenantId,
  signals: readonly StageSignal[],
): Promise<ForecastSummary> => {
  const points = await collectForecasts(signals, tenantId);
  const total = points.length;
  const values = points.map((point) => point.forecast);

  return {
    tenantId,
    total,
    average: total === 0 ? 0 : values.reduce((left, right) => left + right, 0) / total,
    min: total === 0 ? 0 : values.reduce((left, right) => Math.min(left, right), Number.POSITIVE_INFINITY),
    max: total === 0 ? 0 : values.reduce((left, right) => Math.max(left, right), Number.NEGATIVE_INFINITY),
    points,
  };
};

export const summarizeRecommendations = (
  summary: ForecastSummary,
): ReadonlyArray<Recommendation> =>
  summary.points
    .toSorted((left, right) => right.forecast - left.forecast)
    .map((point, index) => ({
      code: `recommendation-${point.windowId}` as Recommendation['code'],
      severity: point.forecast > 0.75 ? 'critical' : point.forecast > 0.55 ? 'high' : 'medium',
      phase: index % 3 === 0 ? 'score' : index % 3 === 1 ? 'simulate' : 'recommend',
      rationale: `signal=${point.signalId}, severity=${point.severity}, forecast=${point.forecast.toFixed(4)}`,
      affectedSignals: [point.signalId],
      estimatedMitigationMinutes: Math.max(1, Math.round(point.forecast * 42)),
    }));

export const defaultWindowSize = bootstrapConfig.defaultWindowMinutes;
