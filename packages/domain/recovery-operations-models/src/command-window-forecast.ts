import { z } from 'zod';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';

export const commandWindowStateSchema = z.enum(['open', 'active', 'closed', 'expired']);

export type CommandWindowState = z.infer<typeof commandWindowStateSchema>;

export interface CommandWindowMetric {
  readonly metricId: Brand<string, 'CommandWindowMetricId'>;
  readonly name: string;
  readonly value: number;
  readonly weight: number;
  readonly unit: 'score' | 'percent' | 'duration-ms' | 'count';
  readonly goodDirection: 'higher' | 'lower';
}

export interface CommandWindowSample {
  readonly sampleId: Brand<string, 'CommandWindowSampleId'>;
  readonly commandId: Brand<string, 'CommandArtifactId'>;
  readonly state: CommandWindowState;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly metrics: readonly CommandWindowMetric[];
  readonly contributors: readonly {
    readonly area: string;
    readonly impact: number;
  }[];
}

export interface CommandWindowForecast {
  readonly windowId: Brand<string, 'CommandWindowId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly commandId: Brand<string, 'CommandArtifactId'>;
  readonly expectedCloseAt: string;
  readonly forecastAt: string;
  readonly confidence: number;
  readonly samples: readonly CommandWindowSample[];
  readonly riskSignals: readonly string[];
}

export interface CommandWindowPrediction {
  readonly forecast: CommandWindowForecast;
  readonly probability: number;
  readonly rationale: readonly string[];
  readonly recommendedActions: readonly string[];
}

export interface CommandWindowAggregate {
  readonly windowId: Brand<string, 'CommandWindowId'>;
  readonly score: number;
  readonly trend: 'improving' | 'degrading' | 'stable';
  readonly pressure: number;
  readonly confidence: number;
}

export const commandWindowSampleSchema = z.object({
  sampleId: z.string(),
  commandId: z.string(),
  state: commandWindowStateSchema,
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).optional(),
  metrics: z.array(
    z.object({
      metricId: z.string(),
      name: z.string(),
      value: z.number().finite(),
      weight: z.number().min(0).max(1),
      unit: z.enum(['score', 'percent', 'duration-ms', 'count']),
      goodDirection: z.enum(['higher', 'lower']),
    }),
  ),
  contributors: z.array(
    z.object({
      area: z.string(),
      impact: z.number(),
    }),
  ),
});

export const commandWindowForecastSchema = z.object({
  windowId: z.string(),
  tenant: z.string(),
  commandId: z.string(),
  expectedCloseAt: z.string().datetime({ offset: true }),
  forecastAt: z.string().datetime({ offset: true }),
  confidence: z.number().min(0).max(1),
  samples: z.array(commandWindowSampleSchema),
  riskSignals: z.array(z.string()),
});

export const calculateMetricScore = (metric: CommandWindowMetric): number => {
  if (metric.unit === 'duration-ms') {
    const normalized = metric.value === 0 ? 0 : 1 / (1 + metric.value / 1_000);
    return metric.goodDirection === 'lower' ? normalized : 1 - normalized;
  }

  if (metric.unit === 'percent') {
    const normalized = Math.max(0, Math.min(1, metric.value / 100));
    return metric.goodDirection === 'higher' ? normalized : 1 - normalized;
  }

  if (metric.unit === 'count') {
    const capped = Math.max(0, Math.min(1, metric.value / 100));
    return metric.goodDirection === 'lower' ? 1 - capped : capped;
  }

  return metric.goodDirection === 'higher' ? metric.value : 1 - metric.value;
};

export const aggregateWindow = (sample: CommandWindowSample): CommandWindowAggregate => {
  const weights = sample.metrics.map((metric) => metric.weight);
  const totalWeight = Math.max(weights.reduce((sum, value) => sum + value, 0), 1);
  const weightedScore = sample.metrics.reduce(
    (total, metric) => total + calculateMetricScore(metric) * metric.weight,
    0,
  );

  const pressure = sample.contributors.reduce((sum, current) => sum + Math.max(0, current.impact), 0);
  const score = weightedScore / totalWeight;
  const normalizedPressure = Math.max(0, Math.min(1, pressure / 200));

  const previous = weightedScore > totalWeight / 2;
  const trend: CommandWindowAggregate['trend'] = previous ? 'improving' : score > 0.6 ? 'stable' : 'degrading';

  return {
    windowId: withBrand('window-aggregate', 'CommandWindowId'),
    score,
    trend,
    pressure: normalizedPressure,
    confidence: sample.metrics.length > 0 ? Math.min(1, totalWeight / sample.metrics.length) : 0,
  };
};

export const forecastWindowClosure = (forecast: CommandWindowForecast): CommandWindowPrediction => {
  commandWindowForecastSchema.parse(forecast);
  const latest = forecast.samples.at(-1);

  if (!latest) {
    return {
      forecast,
      probability: 0,
      rationale: ['no samples available'],
      recommendedActions: ['collect more telemetry'],
    };
  }

  const aggregate = aggregateWindow(latest);

  const criticalSignals = forecast.riskSignals.filter((signal) => signal.includes('critical')).length;
  const probability = Math.max(0, Math.min(1, aggregate.score - aggregate.pressure * 0.2));

  const actionHints: string[] = [];
  if (latest.state === 'open' && aggregate.pressure > 0.7) {
    actionHints.push('allocate additional operator capacity');
  }
  if (criticalSignals > 0) {
    actionHints.push('escalate to incident responder');
  }
  if (forecast.confidence < 0.5) {
    actionHints.push('request additional probes before closure');
  }

  const rationale = [
    `score=${aggregate.score.toFixed(3)}`,
    `trend=${aggregate.trend}`,
    `pressure=${aggregate.pressure.toFixed(3)}`,
    `confidence=${aggregate.confidence.toFixed(2)}`,
    `samples=${forecast.samples.length}`,
  ];

  return {
    forecast,
    probability,
    rationale,
    recommendedActions: actionHints.length > 0 ? actionHints : ['continue monitoring'],
  };
};

export const buildWindowFromSamples = (
  samples: readonly CommandWindowSample[],
  tenant: Brand<string, 'TenantId'>,
  commandId: Brand<string, 'CommandArtifactId'>,
): CommandWindowForecast => ({
  windowId: withBrand(`${tenant}:${commandId}:forecast`, 'CommandWindowId'),
  tenant,
  commandId,
  expectedCloseAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  forecastAt: new Date().toISOString(),
  confidence: Math.min(1, Math.max(0.05, samples.length / 5)),
  samples,
  riskSignals: samples.flatMap((sample) =>
    sample.metrics
      .filter((metric) => calculateMetricScore(metric) < 0.3)
      .map((metric) => `${metric.name}-low-${metric.value}`),
  ),
});
