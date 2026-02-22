import type {
  SimulationSummary,
  SimulationWorkspace,
  TelemetryEvent,
} from '@domain/recovery-simulation-planning';

export interface RecoveryDiagnosticPoint {
  readonly metric: string;
  readonly score: number;
  readonly state: string;
}

export interface RecoveryRunHealth {
  readonly score: number;
  readonly violations: readonly string[];
  readonly trend: readonly RecoveryDiagnosticPoint[];
}

export interface RunDiagnostics {
  readonly runId: string;
  readonly workspace: SimulationWorkspace;
  readonly health: RecoveryRunHealth;
  readonly telemetryByKind: Record<string, number>;
}

export const buildHealth = (summary: SimulationSummary): RecoveryRunHealth => ({
  score: summary.score,
  violations: summary.recommendedActions,
  trend: [
    { metric: 'status', score: summary.score, state: summary.readinessState },
    { metric: 'failures', score: summary.failureCount, state: summary.status },
  ],
});

export const countEvents = (events: readonly TelemetryEvent[]) => {
  const count: Record<string, number> = {};
  for (const event of events) {
    count[event.kind] = (count[event.kind] ?? 0) + 1;
  }
  return count;
};

export const deriveRunDiagnostics = (
  runId: string,
  summary: SimulationSummary,
  workspace: SimulationWorkspace,
  events: readonly TelemetryEvent[],
): RunDiagnostics => ({
  runId,
  workspace,
  health: buildHealth(summary),
  telemetryByKind: countEvents(events),
});
