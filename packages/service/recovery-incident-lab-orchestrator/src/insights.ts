import type { IncidentLabRun, IncidentLabSignal } from '@domain/recovery-incident-lab-core';
import type { OrchestratorStatus } from './types';

export interface RunInsight {
  readonly runId: string;
  readonly completed: number;
  readonly failed: number;
  readonly health: number;
}

export interface RunSummary {
  readonly completed: number;
  readonly total: number;
  readonly health: number;
  readonly failed: number;
  readonly skipped: number;
}

export const runToInsight = (run: IncidentLabRun): RunInsight => {
  const completed = run.results.filter((item) => item.status === 'done').length;
  const failed = run.results.filter((item) => item.status === 'failed').length;
  const health = completed > 0
    ? Math.max(0, 100 - failed * 10 - Math.max(0, run.results.length - completed) * 3)
    : 100;
  return {
    runId: run.runId,
    completed,
    failed,
    health,
  };
};

export const summarizeRun = (run: IncidentLabRun): RunSummary => {
  const completed = run.results.filter((item) => item.status === 'done').length;
  const failed = run.results.filter((item) => item.status === 'failed').length;
  const skipped = run.results.filter((item) => item.status === 'skipped').length;
  const total = run.results.length;
  const health = completed > 0
    ? Math.max(0, 100 - failed * 10 - skipped * 5)
    : 100;
  return {
    completed,
    total,
    health,
    failed,
    skipped,
  };
};

export const summarizeSignals = (signals: readonly IncidentLabSignal[]): { readonly max: number; readonly avg: number; readonly count: number } => {
  if (signals.length === 0) {
    return { max: 0, avg: 0, count: 0 };
  }

  const max = signals.reduce((acc, signal) => Math.max(acc, signal.value), 0);
  const avg = signals.reduce((acc, signal) => acc + signal.value, 0) / signals.length;
  return { max, avg, count: signals.length };
};

export const toStatusText = (status: OrchestratorStatus): string => {
  if (status.state === 'running') {
    return `running since ${status.startedAt} (${status.executed} steps)`;
  }
  if (status.state === 'errored') {
    return `errored at ${status.stoppedAt ?? status.startedAt}`;
  }
  if (status.state === 'stopped') {
    return `stopped at ${status.stoppedAt ?? status.startedAt}`;
  }
  return status.state;
};
