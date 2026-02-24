import type { LabMetricPoint } from './models';

export const createRunEnvelope = (parts: readonly string[]): string => parts.join('|');

export const createTopologySignature = (nodes: readonly string[]): string =>
  nodes
    .map((node) => node.replace(/[:#]/g, ''))
    .sort()
    .join(',');

export const isCriticalSignal = (signal: { readonly severity: number }): boolean => signal.severity >= 4;

export const mergeMetrics = (metrics: readonly LabMetricPoint[]): number =>
  metrics.reduce((sum, metric) => sum + metric.value, 0);

export const formatMetricSeries = (metrics: readonly LabMetricPoint[]): string => {
  const sample = metrics
    .slice(0, 8)
    .map((metric) => `${metric.path}=${metric.value}`)
    .join(',');
  return sample.length === 0 ? 'empty' : sample;
};
