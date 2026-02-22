import type { IncidentPlan, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import { topologicalOrder, routeExecutionBatches } from '@domain/recovery-incident-orchestration';

export interface IncidentCommandAudit {
  readonly command: string;
  readonly incidentId: string;
  readonly canAutoApprove: boolean;
  readonly reasons: readonly string[];
  readonly at: string;
}

export interface RunThroughput {
  readonly runId: string;
  readonly throughputPerMinute: number;
  readonly isHealthy: boolean;
}

export interface RunSummary {
  readonly total: number;
  readonly failed: number;
  readonly done: number;
  readonly accepted: number;
}

const throughputForRun = (run: OrchestrationRun): number => {
  const ended = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  const durationMs = Math.max(1, ended - Date.parse(run.startedAt));
  return Number((60_000 / durationMs).toFixed(4));
};

export const summarizeRuns = (runs: readonly OrchestrationRun[]): {
  readonly total: number;
  readonly failed: number;
  readonly done: number;
  readonly accepted: number;
} =>
  runs.reduce(
    (acc, run) => {
      acc.total += 1;
      acc.accepted += run.state === 'running' ? 1 : 0;
      acc.done += run.state === 'done' ? 1 : 0;
      acc.failed += run.state === 'failed' ? 1 : 0;
      return acc;
    },
    { total: 0, failed: 0, done: 0, accepted: 0 },
  );

export const summarizeThroughput = (runs: readonly OrchestrationRun[]): readonly RunThroughput[] =>
  runs.map((run) => ({
    runId: run.id,
    throughputPerMinute: throughputForRun(run),
    isHealthy: run.state !== 'failed',
  }));

export const buildSummaryEvent = (
  incidentId: string,
  command: string,
  payload: {
    readonly routeId: string;
    readonly approved: boolean;
    readonly reasons: readonly string[];
  },
): { readonly type: string; readonly payload: { readonly command: string; routeId: string; approved: boolean; reasons: string }; createdAt: string } => ({
  type: 'incident-orchestrator.command.summary',
  payload: {
    command,
    routeId: payload.routeId,
    approved: payload.approved,
    reasons: payload.reasons.join(','),
  },
  createdAt: new Date().toISOString(),
});

export const auditPlanDecision = (
  plan: IncidentPlan,
  audit: IncidentCommandAudit,
): IncidentCommandAudit => {
  const now = new Date().toISOString();
  return {
    command: audit.command,
    incidentId: plan.incidentId,
    canAutoApprove: audit.canAutoApprove,
    reasons: [...audit.reasons, `plan=${String(plan.id)}`],
    at: now,
  };
};

export const runbookCoverage = (plan: IncidentPlan): {
  readonly coveredNodes: number;
  readonly uncovered: number;
  readonly score: number;
} => {
  const nodes = plan.route.nodes;
  const coveredNodes = nodes.reduce((count, node) => (node.play.command ? count + 1 : count), 0);
  const uncovered = nodes.length - coveredNodes;
  const score = nodes.length === 0 ? 0 : Number((coveredNodes / nodes.length).toFixed(4));
  return {
    coveredNodes,
    uncovered,
    score,
  };
};

export const timelineDepth = (plan: IncidentPlan): {
  readonly topologicalDepth: number;
  readonly batchCount: number;
  readonly nodeCount: number;
} => {
  const order = topologicalOrder(plan.route);
  return {
    topologicalDepth: new Set(order).size,
    batchCount: routeExecutionBatches(plan.route, 3).length,
    nodeCount: plan.route.nodes.length,
  };
};

export const summarizeCommand = (audits: readonly IncidentCommandAudit[]): {
  readonly count: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly queued: number;
} => {
  const count = audits.length;
  const accepted = audits.filter((entry) => entry.canAutoApprove).length;
  const rejected = count - accepted;
  return {
    count,
    accepted,
    rejected,
    queued: Math.max(0, count - accepted - rejected),
  };
};
