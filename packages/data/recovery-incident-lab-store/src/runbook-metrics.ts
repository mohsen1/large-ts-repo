import { IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';
import { RecoveryIncidentLabRepository } from './repository';
import { LabStoreResult } from './types';

export interface RunbookMetric {
  readonly runbookId: string;
  readonly medianRunMinutes: number;
  readonly coverage: number;
  readonly lastOutcome: string;
}

export interface PlanMetric {
  readonly planId: string;
  readonly queueDepth: number;
  readonly orderedAt: string;
  readonly state: IncidentLabPlan['state'];
}

export interface RunbookDashboard {
  readonly generatedAt: string;
  readonly totalPlans: number;
  readonly totalRuns: number;
  readonly topRunbooks: readonly RunbookMetric[];
  readonly plansByState: Readonly<Record<string, number>>;
}

const estimateMinutes = (run: IncidentLabRun): number => {
  if (run.results.length === 0) {
    return 0;
  }
  const first = new Date(run.results[0].startAt).getTime();
  const last = new Date(run.results[run.results.length - 1].finishAt).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return 0;
  }
  return Math.max(0, (last - first) / (1000 * 60));
};

const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export const buildRunbookDashboard = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId?: string,
): Promise<LabStoreResult<RunbookDashboard>> => {
  const plansPage = scenarioId
    ? await repository.listPlansByScenario(scenarioId)
    : await repository.listPlansByScenario('__all__');
  const runsPage = await repository.listRuns(scenarioId ? { scenarioId } : {});

  const runsByScenario = new Map<string, IncidentLabRun[]>();
  for (const run of runsPage.items) {
    const bucket = runsByScenario.get(run.scenarioId) ?? [];
    runsByScenario.set(run.scenarioId, [...bucket, run]);
  }

  const topRunbooks: RunbookMetric[] = [...runsByScenario.entries()]
    .slice(0, 20)
    .map(([runbookId, runs]) => {
      const minutes = runs.map(estimateMinutes);
      const outcomes = runs.map((run) => run.state);
      return {
        runbookId,
        medianRunMinutes: Number(median(minutes).toFixed(2)),
        coverage: Number((runs.length / Math.max(1, plansPage.total)).toFixed(4)),
        lastOutcome: outcomes[0] ?? 'unknown',
      };
    });

  const plansByState: Record<string, number> = {};
  for (const plan of plansPage.items) {
    plansByState[plan.state] = (plansByState[plan.state] ?? 0) + 1;
  }

  return {
    ok: true,
    value: {
      generatedAt: new Date().toISOString(),
      totalPlans: plansPage.total,
      totalRuns: runsPage.total,
      topRunbooks,
      plansByState,
    },
  };
};

export const summarizePlanMetrics = (metrics: readonly PlanMetric[]): string[] =>
  metrics.slice(0, 10).map((metric) => `${metric.planId}:${metric.state}:${metric.queueDepth}@${metric.orderedAt}`);
