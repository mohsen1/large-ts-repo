import type { OrchestrationOutcome } from './types';

export interface ReportRow {
  readonly label: string;
  readonly value: string;
}

export interface OrchestratorReport {
  readonly workspaceId: string;
  readonly rows: readonly ReportRow[];
}

export const makeReport = (outcome: OrchestrationOutcome): OrchestratorReport => {
  const runWindowCount = outcome.snapshot?.completedWindows.length ?? 0;
  const runSignalCount = outcome.snapshot?.signalCount ?? 0;
  const runDuration = outcome.metrics.elapsedMs;

  return {
    workspaceId: outcome.workspaceId,
    rows: [
      { label: 'verb', value: outcome.verb },
      { label: 'windowCount', value: String(runWindowCount) },
      { label: 'signalCount', value: String(runSignalCount) },
      { label: 'elapsedMs', value: String(runDuration) },
    ],
  };
};

export const summarizeRows = (rows: readonly ReportRow[]): string =>
  rows.map((row) => `${row.label}:${row.value}`).join(' | ');
