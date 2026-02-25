import type { AdaptiveLabRun } from './adaptive-lab';
import { describeAdaptiveRun } from './adaptive-facade';
import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import { randomUUID } from 'node:crypto';

export interface AdaptiveMetric {
  readonly scope: string;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'ratio';
}

export interface AdaptiveDiagnostics {
  readonly runId: string;
  readonly timeline: readonly string[];
  readonly metrics: readonly AdaptiveMetric[];
  readonly hash: string;
  readonly trace: string;
}

const toMetric = (label: string, value: number, unit: AdaptiveMetric['unit']): AdaptiveMetric => ({
  scope: label,
  value,
  unit,
});

export const buildAdaptiveDiagnostics = (run: AdaptiveLabRun): AdaptiveDiagnostics => {
  const timeline = [...run.pipeline.timeline];
  const metrics = [
    toMetric('signal-count', run.output.summary.signalCount, 'count'),
    toMetric('critical-count', run.output.summary.criticalCount, 'count'),
    toMetric('node-count', run.graph.nodes.length, 'count'),
    toMetric('risk', run.output.summary.riskIndex, 'ratio'),
  ];

  const hashSeed = `${run.runId}:${run.output.summary.signalCount}:${run.output.candidates.length}:${randomUUID()}`;
  const trace = describeAdaptiveRun(run);
  return {
    runId: run.runId,
    timeline,
    metrics,
    hash: hashSeed,
    trace,
  };
};

export const metricDigest = (diagnostics: AdaptiveDiagnostics): string => {
  const line = collectIterable(mapIterable(diagnostics.metrics, (metric) => `${metric.scope}:${metric.value.toFixed(3)}`)).join('|');
  return `${diagnostics.runId}::${line}`;
};

export const explainDiagnostics = (run: AdaptiveLabRun): readonly string[] => [
  `summary=${run.output.summary.health}`,
  `risk=${run.output.summary.riskIndex.toFixed(3)}`,
  `nodes=${run.graph.nodes.length}`,
  `timeline=${run.pipeline.timeline.length}`,
  ...run.pipeline.timeline,
];

export const normalizeScope = (scope: string): string => scope.trim().toLowerCase();

export const summarizeAdaptiveRun = async (run: AdaptiveLabRun): Promise<string> => {
  const diagnostics = buildAdaptiveDiagnostics(run);
  const values = collectIterable(mapIterable(diagnostics.metrics, (metric) => metric.value));
  const score = values.reduce((acc, value) => acc + value, 0);
  return `${run.runId}:${run.output.summary.riskIndex.toFixed(3)}:${score.toFixed(3)}:${metricDigest(diagnostics).slice(0, 24)}`;
};

export const collectDiagnosticsAsync = async (runs: readonly AdaptiveLabRun[]): Promise<readonly AdaptiveDiagnostics[]> => {
  const diagnostics = mapIterable(runs, (run) => buildAdaptiveDiagnostics(run));
  return [...collectIterable(diagnostics)] as readonly AdaptiveDiagnostics[];
};

export const mapDiagnosticLines = async (run: AdaptiveLabRun): Promise<readonly string[]> => {
  const diagnostics = await collectDiagnosticsAsync([run]);
  return diagnostics
    .map((entry) => `${entry.runId}:${entry.hash}`)
    .toSorted();
};

export const buildTrace = (trace: string): string => trace;
