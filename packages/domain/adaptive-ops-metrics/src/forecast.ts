import { z } from 'zod';
import { AdaptivePolicy, SignalSample, AdaptiveRun, AdaptiveDecision } from '@domain/adaptive-ops';
import { MetricsWindow, RunForecast, RunForecastPoint } from './types';

const forecastInputSchema = z.object({
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  horizonMinutes: z.number().positive().int(),
  maxPoints: z.number().positive().int().max(48),
});

export type ForecastInput = z.infer<typeof forecastInputSchema>;

export interface ForecastContext {
  tenantId: string;
  window: MetricsWindow;
  policies: readonly AdaptivePolicy[];
  signals: readonly SignalSample[];
  history: readonly AdaptiveRun[];
}

export interface ForecastConfig {
  intervalMinutes: number;
  noiseBand: number;
  defaultRecoveryMinutes: number;
}

const defaultConfig: ForecastConfig = {
  intervalMinutes: 5,
  noiseBand: 0.15,
  defaultRecoveryMinutes: 18,
};

const sortPoints = (points: readonly RunForecastPoint[]): RunForecastPoint[] =>
  [...points].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

const classifyRecommendation = (risk: number, policyCoverage: number): RunForecast['recommendation'] => {
  if (risk > 0.8) return 'scale';
  if (risk > 0.55 && policyCoverage < 0.5) return 'reroute';
  if (risk > 0.3) return 'observe';
  return 'noop';
};

const estimatePolicyCoverage = (policyCount: number, decisions: readonly AdaptiveDecision[]): number => {
  if (policyCount === 0) return 0;
  const unique = new Set(decisions.map((decision) => decision.policyId)).size;
  return Math.max(0, unique / Math.max(1, policyCount));
};

const policyPressure = (policies: readonly AdaptivePolicy[], signals: readonly SignalSample[]): number => {
  const coveredKinds = new Set(
    policies.flatMap((policy) => policy.allowedSignalKinds),
  );
  const coveredSignalCount = signals.filter((signal) => coveredKinds.has(signal.kind)).length;
  return signals.length === 0 ? 0 : coveredSignalCount / signals.length;
};

export const parseForecastInput = (value: unknown): ForecastInput => forecastInputSchema.parse(value);

export const buildForecast = (
  context: ForecastContext,
  rawInput: ForecastInput,
  config: ForecastConfig = defaultConfig,
): RunForecast => {
  const parsed = parseForecastInput(rawInput);
  const totalDecisions = context.history.flatMap((run) => run.decisions);
  const policyCoverage = estimatePolicyCoverage(context.policies.length, totalDecisions);
  const signalCoverage = policyPressure(context.policies, context.signals);
  const volatility = Math.max(0, Math.min(1, Math.abs(context.signals.reduce((acc, signal) => acc + signal.value, 0) / (context.signals.length || 1) - signalCoverage)));

  const points: RunForecastPoint[] = [];
  let accumulatedRisk = Math.max(0, Math.min(1, volatility + signalCoverage * 0.6));
  const trend = totalDecisions.length > 0 ? averageDecisionConfidence(totalDecisions) : 0.5;

  for (let minute = 0; minute < parsed.horizonMinutes; minute += config.intervalMinutes) {
    const timestamp = new Date(Date.now() + minute * 60_000).toISOString();
    const expectedRecoveryMinutes = Math.max(
      1,
      Math.round(config.defaultRecoveryMinutes + (trend - 0.5) * 20 + accumulatedRisk * 15),
    );
    const projectedRisk = clamp01(accumulatedRisk + Math.sin(minute / parsed.horizonMinutes) * config.noiseBand);
    const topPolicy = selectTopPolicy(context.policies, totalDecisions);

    points.push({
      timestamp,
      projectedRisk,
      expectedRecoveryMinutes,
      dominantPolicyId: topPolicy,
      confidence: Math.max(0.2, 1 - Math.abs(0.5 - projectedRisk)),
    });

    accumulatedRisk = clamp01(projectedRisk + config.noiseBand * 0.1 * Math.sign(projectedRisk - 0.5));
  }

  return {
    runId: parsed.runId,
    tenantId: parsed.tenantId,
    points: sortPoints(points),
    recommendation: classifyRecommendation(policyCoverage, signalCoverage),
  };
};

export const projectWindow = (base: MetricsWindow, fromMinutes: number): MetricsWindow => ({
  ...base,
  windowStart: new Date(Date.parse(base.windowStart) - fromMinutes * 60_000).toISOString(),
  windowEnd: new Date(Date.parse(base.windowEnd)).toISOString(),
});

export const averageDecisionConfidence = (decisions: readonly AdaptiveDecision[]): number => {
  if (decisions.length === 0) return 0;
  const total = decisions.reduce((acc, decision) => acc + decision.confidence, 0);
  return total / decisions.length;
};

export const selectTopPolicy = (
  policies: readonly AdaptivePolicy[],
  decisions: readonly AdaptiveDecision[],
): string | null => {
  if (decisions.length === 0) return policies[0] ? `${policies[0].id}` : null;
  const byCount = new Map<string, number>();
  for (const decision of decisions) {
    byCount.set(decision.policyId, (byCount.get(decision.policyId) ?? 0) + decision.selectedActions.length);
  }
  const [policyId] = [...byCount.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  return policyId ?? null;
};

export const mergeForecasts = (left: RunForecast, right: RunForecast): RunForecast => {
  const timeline = [...left.points, ...right.points]
    .filter((point, index, all) => all.findIndex((item) => item.timestamp === point.timestamp) === index)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    runId: left.runId,
    tenantId: left.tenantId,
    points: timeline,
    recommendation: right.recommendation === 'scale' || left.recommendation === 'scale' ? 'scale' : right.recommendation,
  };
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
