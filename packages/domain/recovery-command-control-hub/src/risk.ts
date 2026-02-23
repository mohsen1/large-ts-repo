import { type HubExecution, type HubSummary, type HubNode, type RiskPosture, type ImpactBand } from './types';

export interface BandRisk {
  readonly band: ImpactBand;
  readonly score: number;
  readonly confidence: number;
}

export interface RiskEnvelope {
  readonly runId: string;
  readonly posture: RiskPosture;
  readonly score: number;
  readonly recommendations: readonly string[];
}

const bandWeight: Record<ImpactBand, number> = {
  critical: 18,
  high: 10,
  medium: 4,
  low: 1,
};

const stateWeight: Record<string, number> = {
  queued: 0.5,
  scheduled: 1,
  executing: 2,
  success: 0,
  failed: 5,
  skipped: 0.2,
};

export const scoreByBands = (nodes: readonly HubNode[]): readonly BandRisk[] =>
  (['critical', 'high', 'medium', 'low'] as const).map((band) => {
    const entries = nodes.filter((node) => node.impactBand === band);
    const score = entries.reduce((acc, node) => acc + bandWeight[node.impactBand] + stateWeight[node.state], 0);
    const confidence = nodes.length === 0 ? 0 : entries.length / nodes.length;
    return { band, score, confidence };
  });

export const scoreExecution = (execution: HubExecution): number => {
  const nodeRisk = scoreByBands(execution.run.topology.nodes).reduce((acc, item) => acc + item.score, 0);
  const failed = execution.checkpoints.filter((checkpoint) => checkpoint.state === 'failed').length;
  const blocked = execution.blocked.length;
  return Number((nodeRisk + failed * 7 + blocked * 5 + execution.run.riskScore).toFixed(2));
};

export const inferPosture = (summary: HubSummary): RiskPosture => {
  const failureRate = summary.totalNodes === 0 ? 0 : summary.byState.failed / summary.totalNodes;
  const blockedRate = summary.totalNodes === 0 ? 0 : summary.blockedNodeCount / summary.totalNodes;
  const loadRatio = summary.totalDurationMs / 1_000_000;
  const score = failureRate + blockedRate + loadRatio;

  if (score > 0.75) {
    return 'degraded';
  }
  if (score > 0.35) {
    return 'elevated';
  }
  return 'stable';
};

export const buildRiskRecommendations = (execution: HubExecution): readonly string[] => {
  const next: string[] = [];
  if (execution.blocked.length > 0) {
    next.push(`Unblock ${execution.blocked.length} dependency blockers`);
  }
  if (execution.checkpoints.some((checkpoint) => checkpoint.state === 'failed')) {
    next.push('Re-run failed commands or add compensating controls');
  }
  if (execution.run.topology.edges.length > execution.run.topology.nodes.length) {
    next.push('Topology too dense; consider splitting into phases');
  }
  if (execution.operatorNotes.length > 3) {
    next.push('Review operator notes before continuing');
  }
  return next;
};

export const buildRiskEnvelope = (execution: HubExecution): RiskEnvelope => {
  const summary = summarizeExecution(execution);
  return {
    runId: execution.run.runId,
    posture: inferPosture(summary),
    score: scoreExecution(execution),
    recommendations: buildRiskRecommendations(execution),
  };
};

const summarizeExecution = (execution: HubExecution): HubSummary => {
  const byState = {
    queued: execution.run.topology.nodes.filter((node) => node.state === 'queued').length,
    scheduled: execution.run.topology.nodes.filter((node) => node.state === 'scheduled').length,
    executing: execution.run.topology.nodes.filter((node) => node.state === 'executing').length,
    success: execution.run.topology.nodes.filter((node) => node.state === 'success').length,
    failed: execution.run.topology.nodes.filter((node) => node.state === 'failed').length,
    skipped: execution.run.topology.nodes.filter((node) => node.state === 'skipped').length,
  };
  const byBand = {
    critical: execution.run.topology.nodes.filter((node) => node.impactBand === 'critical').length,
    high: execution.run.topology.nodes.filter((node) => node.impactBand === 'high').length,
    medium: execution.run.topology.nodes.filter((node) => node.impactBand === 'medium').length,
    low: execution.run.topology.nodes.filter((node) => node.impactBand === 'low').length,
  };

  return {
    runCount: 1,
    totalNodes: execution.run.topology.nodes.length,
    byState,
    byBand,
    totalDurationMs: execution.run.topology.nodes.reduce((acc, node) => acc + node.estimatedDurationMs, 0),
    blockedNodeCount: execution.blocked.length,
  };
};
