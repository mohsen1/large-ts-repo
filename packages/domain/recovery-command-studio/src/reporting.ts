import type { CommandMetric, CommandRun, CommandSimulation, CommandStudioWorkspaceId, StudioRuntimeState } from './types';
import { average, buildThroughput } from './utils';

export interface WorkspaceReport {
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly activeRuns: number;
  readonly completedRuns: number;
  readonly averageCompletionScore: number;
  readonly warningDensity: number;
}

interface MetricPoint {
  readonly runId: CommandRun['runId'];
  readonly value: number;
}

const runCompletionScore = (run: CommandRun): number => {
  if (run.state === 'complete') return 1;
  if (run.state === 'failed') return 0;
  if (run.state === 'queued' || run.state === 'active') return 0.5;
  return 0.2;
};

const simulationRisk = (simulation: CommandSimulation): number => {
  if (!simulation.outcome.ok) return 1;
  return 1 - simulation.outcome.confidence;
};

export const aggregateMetrics = (metrics: readonly CommandMetric[]): Readonly<Record<string, number>> => {
  const grouped = new Map<string, number[]>();
  for (const metric of metrics) {
    const bucket = grouped.get(metric.label) ?? [];
    bucket.push(metric.value);
    grouped.set(metric.label, bucket);
  }

  const result: Record<string, number> = {};
  for (const [label, values] of grouped) {
    result[label] = average(values);
  }

  return result;
};

export const buildWorkspaceReport = (state: StudioRuntimeState): readonly WorkspaceReport[] => {
  const groupedRuns = new Map<string, readonly CommandRun[]>();
  for (const run of state.runs) {
    groupedRuns.set(run.workspaceId, [...(groupedRuns.get(run.workspaceId) ?? []), run]);
  }

  return Array.from(groupedRuns.entries()).map(([workspaceId, runs]) => {
    const completions = runs.map(runCompletionScore);
    const workspaceSimulations = state.simulations.filter((simulation) =>
      runs.some((run) => run.sequenceId === simulation.sequenceId),
    );
    const warningDensity = workspaceSimulations.length
      ? average(workspaceSimulations.map(simulationRisk))
      : 0;

    return {
      workspaceId: workspaceId as CommandStudioWorkspaceId,
      activeRuns: runs.filter((run) => run.state === 'active').length,
      completedRuns: runs.filter((run) => run.state === 'complete').length,
      averageCompletionScore: average(completions),
      warningDensity,
    };
  });
};

export const buildThroughputByRun = (run: CommandRun, metrics: readonly CommandMetric[]): MetricPoint[] => {
  const throughputByNode = run.completedNodeIds.length;
  const msValues = metrics
    .filter((metric) => metric.unit === 'ms')
    .map((metric) => ({
      runId: metric.commandId as unknown as CommandRun['runId'],
      value: metric.value,
    }));

  const ratio = buildThroughput([], run.completedNodeIds);
  return [
    ...msValues,
    {
      runId: run.runId,
      value: throughputByNode + ratio,
    },
  ];
};
