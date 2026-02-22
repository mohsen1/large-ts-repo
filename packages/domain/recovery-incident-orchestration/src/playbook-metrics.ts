import { withBrand } from '@shared/core';
import { routeExecutionBatches, topologicalOrder } from './planner';
import type {
  IncidentId,
  IncidentPlan,
  OrchestrationRun,
  SeverityBand,
  WorkItemId,
  RecoveryRouteNode,
  RouteBuildOptions,
  IncidentRecord,
} from './types';
import type { PlaybookId, PlaybookTemplate, PlaybookReadiness, PlaybookCandidate } from './playbook-model';

export interface PortfolioHealthSignal {
  readonly playbookId: PlaybookId;
  readonly incidentId: IncidentId;
  readonly score: number;
  readonly severity: SeverityBand;
  readonly nodeCount: number;
  readonly batchCount: number;
}

export interface RunbookEnvelope {
  readonly runbookId: PlaybookId;
  readonly incidentId: IncidentId;
  readonly runs: readonly OrchestrationRun[];
  readonly options: RouteBuildOptions;
}

export interface HealthTrendPoint {
  readonly at: string;
  readonly signal: number;
  readonly completed: number;
  readonly failed: number;
}

interface PathNodeWeight {
  readonly node: WorkItemId;
  readonly weight: number;
}

export const planToSignal = (plan: IncidentPlan): PortfolioHealthSignal => {
  const signal = routeExecutionBatches(plan.route, 3).length / Math.max(1, plan.route.nodes.length);
  const nodeCount = topologicalOrder(plan.route).length;
  const batches = routeExecutionBatches(plan.route, 4).length;
  return {
    playbookId: withBrand(`signal:${plan.id}`, 'PlaybookId'),
    incidentId: plan.incidentId,
    score: Number(Math.min(1, 1 - signal * 0.1).toFixed(4)),
    severity: 'critical',
    nodeCount,
    batchCount: batches,
  };
};

export const normalizeHealth = (signal: number): number =>
  signal < 0 ? 0 : signal > 1 ? 1 : Number(signal.toFixed(4));

export const summarizeEnvelope = (envelope: RunbookEnvelope): {
  readonly runCount: number;
  readonly doneCount: number;
  readonly healthyRuns: number;
  readonly readinessScore: number;
} => {
  const doneCount = envelope.runs.reduce((acc, run) => acc + (run.state === 'done' ? 1 : 0), 0);
  const healthyRuns = envelope.runs.filter((run) => run.state === 'done' || run.state === 'running').length;
  const readinessScore = Number((healthyRuns / Math.max(1, envelope.runs.length)).toFixed(4));
  return {
    runCount: envelope.runs.length,
    doneCount,
    healthyRuns,
    readinessScore: normalizeHealth(readinessScore),
  };
};

export const buildBatchHealthTrend = (
  runs: readonly OrchestrationRun[],
): readonly HealthTrendPoint[] =>
  runs.map((run, index) => {
    const completed = run.state === 'done' ? 1 : 0;
    const failed = run.state === 'failed' ? 1 : 0;
    const base = (completed + failed) / (index + 1);
    return {
      at: run.startedAt,
      signal: Number((1 - base * 0.25).toFixed(4)),
      completed,
      failed,
    };
  });

export const scoreCandidates = (
  candidates: readonly PlaybookCandidate[],
  readiness: PlaybookReadiness,
): readonly PlaybookCandidate[] =>
  [...candidates]
    .map((candidate) => {
      const commandCount = candidate.template.commands.length;
      const confidence = readiness.confidence;
      const score = Number((candidate.priority + confidence + commandCount * 0.05).toFixed(4));
      return {
        ...candidate,
        priority: score,
        reason: `${candidate.reason}; score=${score}`,
      };
    })
    .sort((left, right) => right.priority - left.priority);

export const estimateTemplateCoverage = (
  template: PlaybookTemplate,
): {
  readonly commandCoverage: number;
  readonly commandIds: readonly WorkItemId[];
  readonly ownerMap: Record<string, number>;
} => {
  const ownerMap = template.commands.reduce<Record<string, number>>((acc, command) => {
    acc[command.owner] = (acc[command.owner] ?? 0) + 1;
    return acc;
  }, {});
  const commandIds = template.commands.map((command) => withBrand(`${template.id}:${command.id}`, 'WorkItemId'));
  const commandCoverage = template.commands.length === 0 ? 0 : Number((commandIds.length / 12).toFixed(4));
  return {
    commandCoverage,
    commandIds,
    ownerMap,
  };
};

export const rankReadinessBuckets = (
  readiness: PlaybookReadiness,
): readonly { readonly owner: string; readonly score: number }[] =>
  readiness.budget
    .map((item) => ({
      owner: item.owner,
      score: Number((item.requiredCapacity / (item.commandCount || 1)).toFixed(4)),
    }))
    .sort((left, right) => right.score - left.score);

export const buildPortfolioSignals = (
  incident: IncidentRecord,
  plan: IncidentPlan,
): {
  readonly incidentId: IncidentId;
  readonly score: number;
  readonly critical: boolean;
  readonly labels: readonly string[];
}[] =>
  incident.labels.map((label) => ({
    incidentId: incident.id,
    score: Number((label.length + plan.route.nodes.length) / 60),
    critical: incident.severity === 'critical' || incident.severity === 'extreme',
    labels: [label],
  }));

export const computePathWeights = (nodes: readonly RecoveryRouteNode[]): readonly PathNodeWeight[] =>
  nodes.map((node, index) => {
    const dependsFactor = 1 + node.dependsOn.length * 0.2;
    const commandFactor = node.play.command.length / 10;
    const weight = Number((dependsFactor + commandFactor + index * 0.02).toFixed(4));
    return { node: node.id, weight };
  });

export const topPathNodes = (
  nodes: readonly RecoveryRouteNode[],
  limit = 4,
): readonly WorkItemId[] =>
  [...computePathWeights(nodes)]
    .sort((left: PathNodeWeight, right: PathNodeWeight) => right.weight - left.weight)
    .slice(0, limit)
    .map((entry: PathNodeWeight) => entry.node);
