import type { SimulationRunRecord } from '@domain/recovery-simulation-core';
import { buildTelemetry } from './execution-tracker';

export interface LabDashboardModel {
  readonly runId: string;
  readonly statusLine: string;
  readonly recommendations: readonly string[];
  readonly heatMap: Record<string, number>;
}

export interface DashboardMetric {
  readonly label: string;
  readonly value: number;
  readonly details: string;
}

const statusBucket = (value: number): string => {
  if (value > 0.75) return 'warning';
  if (value > 0.5) return 'careful';
  return 'ok';
};

export const buildDashboard = (run: SimulationRunRecord): LabDashboardModel => {
  const telemetry = buildTelemetry(run);
  const completed = run.executedSteps.filter((step) => step.state === 'completed').length;
  const failed = run.executedSteps.filter((step) => step.state === 'failed').length;

  const recommendations: string[] = [];
  if (telemetry.progress < 0.2) {
    recommendations.push('accelerate initial batch before step exhaustion');
  }
  if (failed > 0) {
    recommendations.push('investigate failed steps and rerun');
  }
  if (telemetry.elapsedMs > 180_000) {
    recommendations.push('consider split and run parallel lanes');
  }

  return {
    runId: run.id,
    statusLine: `run=${telemetry.runId},progress=${Math.round(telemetry.progress * 100)}%,state=${statusBucket(telemetry.progress)}`,
    recommendations,
    heatMap: {
      completed,
      failed,
      stalled: run.executedSteps.filter((step) => step.state === 'stalled').length,
      queued: run.executedSteps.filter((step) => step.state === 'queued').length,
    },
  };
};

export const summaryCards = (run: SimulationRunRecord): readonly DashboardMetric[] => {
  const telemetry = buildTelemetry(run);
  return [
    { label: 'progress', value: Math.round(telemetry.progress * 100), details: 'percent complete' },
    { label: 'commands', value: telemetry.commandCount, details: 'total commands' },
    { label: 'elapsed', value: Math.round(telemetry.elapsedMs / 1000), details: 'seconds elapsed' },
  ];
};
