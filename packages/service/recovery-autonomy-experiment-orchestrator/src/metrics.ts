import type { OrchestrationResult } from './types';

export interface RunMetricsPoint {
  readonly runId: string;
  readonly outputCount: number;
  readonly success: boolean;
  readonly durationMs: number;
  readonly pluginCount: number;
}

export const toMetrics = <T>(result: OrchestrationResult<T>): RunMetricsPoint => ({
  runId: result.state.runId,
  outputCount: result.outputs.length,
  success: result.ok,
  durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
  pluginCount: result.pluginCount,
});

export const summarizeMetrics = (metrics: readonly RunMetricsPoint[]): string => {
  const total = metrics.reduce((acc, metric) => acc + metric.outputCount, 0);
  const success = metrics.reduce((acc, metric) => (metric.success ? acc + 1 : acc), 0);
  const duration = metrics.reduce((acc, metric) => acc + metric.durationMs, 0);
  const average = metrics.length ? (duration / metrics.length).toFixed(2) : '0';
  return `runs=${metrics.length}, outputs=${total}, success=${success}, avg=${average}ms`;
};

export const scoreMetrics = (metric: RunMetricsPoint): number => {
  const successWeight = metric.success ? 50 : 0;
  const outputWeight = Math.min(30, metric.outputCount * 2);
  const pluginWeight = Math.min(20, metric.pluginCount);
  return successWeight + outputWeight + pluginWeight;
};
