import { type HubExecution, type HubSummary } from './types';
import { inferPosture, buildRiskRecommendations } from './risk';

export interface DraftInsights {
  readonly posture: ReturnType<typeof inferPosture>;
  readonly recommendedWaitMs: number;
  readonly action: string;
}

export interface ExecutionInsights {
  readonly posture: ReturnType<typeof inferPosture>;
  readonly signal: 'green' | 'amber' | 'red';
  readonly recommendations: readonly string[];
}

export const buildDraftInsights = (summary: HubSummary): DraftInsights => {
  const posture = inferPosture(summary);
  const recommendedWaitMs = Math.min(90_000 + summary.totalNodes * 2_000 + summary.blockedNodeCount * 5_000, 600_000);
  const action =
    posture === 'degraded'
      ? 'gate commands and request approvals'
      : posture === 'elevated'
        ? 'increase operator visibility and hold open window'
        : 'continue standard execution';
  return { posture, recommendedWaitMs, action };
};

export const buildExecutionInsights = (execution: HubExecution): ExecutionInsights => {
  const recommendations = buildRiskRecommendations(execution);
  const summary = {
    runCount: 1,
    totalNodes: execution.run.topology.nodes.length,
    byState: {
      queued: execution.run.topology.nodes.filter((node) => node.state === 'queued').length,
      scheduled: execution.run.topology.nodes.filter((node) => node.state === 'scheduled').length,
      executing: execution.run.topology.nodes.filter((node) => node.state === 'executing').length,
      success: execution.run.topology.nodes.filter((node) => node.state === 'success').length,
      failed: execution.run.topology.nodes.filter((node) => node.state === 'failed').length,
      skipped: execution.run.topology.nodes.filter((node) => node.state === 'skipped').length,
    },
    byBand: {
      critical: execution.run.topology.nodes.filter((node) => node.impactBand === 'critical').length,
      high: execution.run.topology.nodes.filter((node) => node.impactBand === 'high').length,
      medium: execution.run.topology.nodes.filter((node) => node.impactBand === 'medium').length,
      low: execution.run.topology.nodes.filter((node) => node.impactBand === 'low').length,
    },
    totalDurationMs: execution.run.topology.nodes.reduce((acc, node) => acc + node.estimatedDurationMs, 0),
    blockedNodeCount: execution.blocked.length,
  };
  const posture = inferPosture(summary);
  const signal = posture === 'degraded' ? 'red' : posture === 'elevated' ? 'amber' : 'green';

  return { posture, signal, recommendations };
};
