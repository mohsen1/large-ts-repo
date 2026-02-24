import type { PluginPayload, QuantumInput, QuantumOutput, QuantumTelemetryMetric, SignalMeta, SignalWeight, QuantumTenantId } from '../types';
import { asBrand } from '@shared/typed-orchestration-core/brands';

type TelemetryFrame = {
  readonly output: QuantumOutput;
  readonly payload: PluginPayload;
  readonly createdAt: string;
};

type MetricBucketKey = `${'signal' | 'directive' | 'stage'}:${string}`;

export const telemetryEventKey = (kind: 'signal' | 'directive' | 'stage', value: string): MetricBucketKey =>
  `${kind}:${value}`;

export const buildTelemetryMetric = (path: string, value: number, unit: 'count' | 'weight' | 'ms'): QuantumTelemetryMetric => ({
  id: `metric:${path}:${Math.floor(value * 1000)}`,
  path,
  value,
  unit,
  timestamp: new Date().toISOString(),
});

export const buildTelemetryFrame = (payload: PluginPayload): TelemetryFrame => ({
  payload,
  output: payload.output,
  createdAt: new Date().toISOString(),
});

export const metricBucketsFromOutput = (output: QuantumOutput): readonly QuantumTelemetryMetric[] => {
  const stageMetrics = output.stages.map((stage, stageIndex) =>
    buildTelemetryMetric(`stage:${stage.stage}:${stageIndex}`, stage.directives.length, 'count'),
  );
  const directiveMetrics = output.directives.map((directive, index) =>
    buildTelemetryMetric(`directive:${directive.command}:${index}`, directive.priority, 'weight'),
  );
  const quality = buildTelemetryMetric(`outcome:${output.status}`, output.directives.length, 'count');
  return [...stageMetrics, ...directiveMetrics, quality];
};

export const normalizeMetricPath = (prefix: string, suffix: string) =>
  `${prefix.replace(/\/+/g, '/')}:${suffix}` as const;

type MetricValueIterator = { values: number[] };
export const telemetryIterator = (metrics: readonly QuantumTelemetryMetric[]): Readonly<MetricValueIterator> => ({
  values: [...metrics].map((entry) => entry.value),
});

export const percentileFromMetrics = (metrics: readonly QuantumTelemetryMetric[]) => {
  const values = [...telemetryIterator(metrics).values].sort((left: number, right: number) => left - right);
  if (values.length === 0) {
    return { p50: 0, p90: 0, p95: 0 };
  }
  const percentile = (ratio: number) => {
    const index = Math.max(0, Math.min(values.length - 1, Math.floor(values.length * ratio)));
    return values[index];
  };
  return {
    p50: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
  };
};

export const buildTelemetryDigest = (outputs: readonly QuantumOutput[]) => {
  const metrics = outputs.flatMap((output) => metricBucketsFromOutput(output));
  return {
    count: metrics.length,
    values: metrics,
    summary: {
      ...percentileFromMetrics(metrics),
      average: metrics.reduce((acc, metric) => acc + metric.value, 0) / Math.max(metrics.length, 1),
    },
  };
};

export const collectSignalPaths = (
  payloads: readonly TelemetryFrame[],
): ReadonlyArray<{ readonly path: MetricBucketKey; readonly frames: number }> => {
  const map = new Map<MetricBucketKey, number>();
  for (const payload of payloads) {
    const output = payload.output;
    for (const signal of output.directives) {
      const path = telemetryEventKey('directive', signal.command);
      map.set(path, (map.get(path) ?? 0) + 1);
    }
    for (const stage of output.stages) {
      const path = telemetryEventKey('stage', stage.stage);
      map.set(path, (map.get(path) ?? 0) + stage.directives.length);
    }
    for (const signal of payload.payload.input.signals.values) {
      const path = telemetryEventKey('signal', signal.kind);
      map.set(path, (map.get(path) ?? 0) + 1);
    }
  }

  return [...map.entries()]
    .map(([path, frames]) => ({ path, frames }))
    .sort((left, right) => right.frames - left.frames);
};

export const collectTelemetry = (outputs: readonly QuantumOutput[]) => ({
  summary: buildTelemetryDigest(outputs),
  frames: outputs.map((output) => buildTelemetryFrame({ output, input: outputToInput(output), markers: [] })),
});

const outputToInput = (output: QuantumOutput) => ({
  runId: output.runId,
  tenant: asBrand(output.summary.slice(0, 20), 'TenantId') as QuantumTenantId,
  shape: 'adaptive' as const,
  stage: makeSeedStage(output.summary),
  signals: {
      id: `envelope-${output.runId}` as const,
      runId: output.runId,
    recordedAt: output.executedAt,
    values: output.directives.map((directive) => ({
      id: `signal-${directive.id.replace('directive:', '')}` as const,
      tenant: asBrand(output.summary.slice(0, 20), 'TenantId') as QuantumTenantId,
      timestamp: output.executedAt,
      kind: 'control',
      weight: directive.command === 'freeze' ? 'critical' : directive.command === 'throttle' ? 'high' : 'medium',
      actor: directive.reason,
      channel: 'telemetry-channel',
      note: directive.reason,
    }) as SignalMeta),
  },
  budgetMs: 100,
}) as QuantumInput;

const makeSeedStage = (summary: string) => `stage:${summary}` as const;
