import type { ContinuityPlanTemplate, ContinuityRunContext, ContinuityTaskTemplate, ContinuityRiskLevel } from './types';
import { normalizePriorityWeight } from './utility';
import type { ContinuityScorecard } from './schema';

const riskWeight: Record<ContinuityRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const estimateTaskDensity = (tasks: readonly ContinuityTaskTemplate[]): number =>
  tasks.reduce((sum, task) => sum + task.risk.length, 0) / Math.max(tasks.length, 1);

export const buildScorecard = (
  plan: ContinuityPlanTemplate,
  context: ContinuityRunContext,
): ContinuityScorecard => {
  const taskRiskWeights = context.steps
    .map((step) => {
      const task = plan.tasks.find((item) => item.artifactId === step.taskId);
      return riskWeight[task?.risk ?? 'low'];
    })
    .filter(Boolean);

  const maxRisk = Math.max(...taskRiskWeights, 0);
  const averageRisk =
    taskRiskWeights.length === 0
      ? 0
      : taskRiskWeights.reduce((sum, risk) => sum + risk, 0) / taskRiskWeights.length;

  const baseScore =
    plan.priorityWeight * 3 +
    estimateTaskDensity(plan.tasks) / 10 +
    (plan.tasks.length > 0 ? 1 / plan.tasks.length : 0) * 2;

  const confidence = normalizePriorityWeight(
    (1 - (averageRisk + maxRisk) / 8) * (1 - (context.steps.filter((step) => step.status === 'failed').length / Math.max(context.steps.length, 1))),
  );

  const factor: ContinuityRiskLevel =
    maxRisk >= 4
      ? 'critical'
      : maxRisk >= 3
        ? 'high'
        : maxRisk >= 2
          ? 'medium'
          : 'low';

  return {
    risk: {
      factor,
      weight: normalizePriorityWeight(baseScore / 10),
      explanation: `task-count=${plan.tasks.length},steps=${context.steps.length}`,
    },
    score: Number(baseScore.toFixed(3)),
    runState: context.state,
    confidence,
  };
};

export const scoreByTenant = (rows: readonly ContinuityScorecard[]): number => {
  if (!rows.length) return 0;
  const totalScore = rows.reduce((sum, row) => sum + row.score * row.confidence, 0);
  return Number((totalScore / rows.length).toFixed(4));
};

export const criticalityTrend = (rows: readonly ContinuityScorecard[]): 'improving' | 'degrading' | 'neutral' => {
  if (rows.length < 2) return 'neutral';

  const ordered = [...rows];
  const head = ordered[ordered.length - 1]?.confidence ?? 0;
  const tail = ordered[0]?.confidence ?? 0;

  if (head > tail) return 'improving';
  if (head < tail) return 'degrading';
  return 'neutral';
};
