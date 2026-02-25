import type { StudioEvent, StudioMetric, StudioSnapshot } from '@shared/playbook-studio-runtime';
import { summarize, eventKeys, foldMetrics } from '@shared/playbook-studio-runtime';
import { useMemo } from 'react';
import type { StudioRunResult } from '@domain/recovery-playbook-studio-core';

export interface SinkTarget {
  readonly endpoint: string;
  readonly batchSize: number;
}

export interface SinkTelemetry {
  readonly key: string;
  readonly score: number;
  readonly values: Record<string, number>;
  readonly tokens: readonly string[];
}

export interface SinkEnvelope {
  readonly events: readonly string[];
  readonly metrics: Record<string, number>;
  readonly summary: string;
}

export const summarizeSnapshot = (snapshot: StudioSnapshot): SinkEnvelope => {
  const values = summarize(snapshot);
  const tokens = eventKeys(snapshot);
  return {
    events: tokens,
    metrics: values,
    summary: `events:${tokens.length} metrics:${Object.keys(values).length}`,
  };
};

export const describeRunResult = (result: StudioRunResult): SinkTelemetry => {
  const events = eventKeys(result.snapshot);
  const metrics = result.metrics;
  const score = Object.keys(metrics).reduce((acc, key) => {
    if (key.endsWith('.avg')) return acc + metrics[key]!;
    return acc;
  }, 0);
  return {
    key: String(result.run.runId),
    score,
    values: metrics,
    tokens: events,
  };
};

export const collectSeries = (values: readonly SinkTelemetry[]): Record<string, number> => {
  return values.reduce<Record<string, number>>((acc, entry) => {
    for (const [key, value] of Object.entries(entry.values)) {
      acc[`${entry.key}:${key}`] = value;
    }
    return acc;
  }, {});
};

export const useSink = (
  values: readonly StudioMetric[],
  metrics: Record<string, number>,
) => {
  return useMemo(() => {
    const eventCount = values.length;
    const metricCount = Object.keys(metrics).length;
    return {
      metricCount,
      eventCount,
      score: Object.values(metrics).reduce((acc, next) => acc + next, 0) / Math.max(1, metricCount),
      keys: Object.keys(metrics),
    };
  }, [values, metrics]);
};

export const flush = async (
  target: SinkTarget,
  payload: SinkTelemetry,
): Promise<{ readonly ok: true; readonly endpoint: string } | { readonly ok: false; readonly error: string }> => {
  const canSend = target.endpoint.length > 0 && target.batchSize > 0;
  if (!canSend) {
    return {
      ok: false,
      error: 'sink-invalid-target',
    };
  }

  void payload;
  return {
    ok: true,
    endpoint: target.endpoint,
  };
};

export const useFoldedMetrics = (entries: readonly string[]): readonly [string, number][] =>
  entries.map((entry, index) => [entry, index + 1]);

export const foldStudioEvents = (result: StudioRunResult): readonly [string, number][] => {
  const folded = foldMetrics(result.snapshot);
  return folded.map(([name, metric]) => [name, metric.values.length]);
};
