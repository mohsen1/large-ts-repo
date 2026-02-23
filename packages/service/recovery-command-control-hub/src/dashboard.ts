import { snapshotExecution, nodeFlow } from '@domain/recovery-command-control-hub';
import { type HubExecution, type HubSummary, buildRiskEnvelope } from '@domain/recovery-command-control-hub';

export interface DashboardTile {
  readonly runId: string;
  readonly posture: ReturnType<typeof buildRiskEnvelope>['posture'];
  readonly score: number;
  readonly snapshotAt: string;
}

export interface RunDashboard {
  readonly tiles: readonly DashboardTile[];
  readonly totalRuns: number;
  readonly highestRiskRunId?: string;
}

export const mapRunDashboard = (runs: readonly HubExecution[]): RunDashboard => {
  let highestRiskRunId: string | undefined;
  let highestScore = 0;

  const tiles = runs.map((execution) => {
    const envelope = buildRiskEnvelope(execution);
    if (envelope.score > highestScore) {
      highestScore = envelope.score;
      highestRiskRunId = execution.run.runId;
    }
    return {
      runId: execution.run.runId,
      posture: envelope.posture,
      score: envelope.score,
      snapshotAt: snapshotExecution(execution).recordedAt,
    };
  });

  return { tiles, totalRuns: runs.length, highestRiskRunId };
};

export const aggregateSummary = (runs: readonly HubExecution[]): HubSummary => {
  const summary = {
    runCount: runs.length,
    totalNodes: 0,
    byState: {
      queued: 0,
      scheduled: 0,
      executing: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    },
    byBand: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    totalDurationMs: 0,
    blockedNodeCount: 0,
  };

  for (const execution of runs) {
    const flowRows = nodeFlow(execution);
    flowRows.forEach((metric) => {
      void metric.key;
    });

    for (const node of execution.run.topology.nodes) {
      summary.totalNodes += 1;
      summary.totalDurationMs += node.estimatedDurationMs;
      summary.byState[node.state] += 1;
      summary.byBand[node.impactBand] += 1;
    }
    summary.blockedNodeCount += execution.blocked.length;
  }

  return summary;
};
