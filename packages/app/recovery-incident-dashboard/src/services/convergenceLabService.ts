import type {
  ConvergenceDomain,
  ConvergencePlan,
  ConvergenceRunEvent,
  ConvergenceRunResult,
  ConvergenceHealth,
  ConvergenceWorkspaceId,
  ConvergenceWorkspace,
} from '@domain/recovery-ops-orchestration-lab';
import { ConvergenceWorkspaceService, buildInsightForWorkspace } from '@domain/recovery-ops-orchestration-lab';

export interface ConvergenceWorkspaceCard {
  readonly workspaceId: string;
  readonly domain: string;
  readonly signalCount: number;
  readonly planCount: number;
  readonly avgScore: number;
  readonly risk: 'low' | 'medium' | 'high';
}

export interface ConvergenceRunStream {
  readonly runId: string;
  readonly events: readonly ConvergenceRunEvent[];
}

const bootstrapWorkspace = {
  id: 'ws-bootstrap' as ConvergenceWorkspaceId,
  domainId: 'domain:bootstrap' as ConvergenceWorkspace['domainId'],
  policyId: 'policy:bootstrap',
  domain: 'incident' as ConvergenceDomain,
  health: 'stable' as ConvergenceHealth,
  planBudget: 12,
  signals: [],
  plans: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const ensureWorkspace = async (): Promise<ConvergenceWorkspace> => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    ...bootstrapWorkspace,
  };
};

const emptyService = new ConvergenceWorkspaceService();

export const collectWorkspaceSnapshot = async (
  workspace: ConvergenceWorkspace,
): Promise<ConvergenceWorkspaceCard> => {
  const insight = await buildInsightForWorkspace(workspace);
  const signalCount = workspace.signals.length;
  const planCount = workspace.plans.length;
  const avgScore = insight.workspace.avgScore;

  return {
    workspaceId: workspace.id,
    domain: workspace.domain,
    signalCount,
    planCount,
    avgScore,
    risk: insight.workspace.risk,
  };
};

export const streamRun = async function* (
  workspace: ConvergenceWorkspace,
): AsyncGenerator<ConvergenceRunStream> {
  const runId = `${workspace.id}:${Date.now()}`;
  const events: ConvergenceRunEvent[] = [];

  for await (const event of emptyService.run(workspace)) {
    events.push(event);
    yield {
      runId,
      events,
    };
  }
}

export const summarizeWorkspace = async (workspace: ConvergenceWorkspace): Promise<ConvergenceRunResult> => {
  return emptyService.summarize(workspace, workspace.plans);
};

export const reorderPlans = (plans: readonly ConvergencePlan[]): readonly ConvergencePlan[] =>
  [...plans].toSorted((left, right) => right.score - left.score);

export const bootstrapConvergenceWorkspace = async (): Promise<ConvergenceWorkspace> => {
  return ensureWorkspace();
};
