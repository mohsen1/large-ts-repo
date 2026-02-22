import {
  criticalityTrend,
  prioritizePlans,
  rankTaskCriticality,
} from '@domain/recovery-continuity-planning';
import type {
  ContinuityPlanTemplate,
  ContinuityRunContext,
  ContinuityRunId,
  ContinuityRunInput,
  ContinuityTenantId,
} from '@domain/recovery-continuity-planning';
import type { ContinuityPlanStore, PlanStoreSnapshot, PlanStoreSnapshotBuilder } from '@data/recovery-continuity-plan-store';
import { fail, ok, type Result } from '@shared/result';

export interface ContinuityCandidate {
  readonly template: ContinuityPlanTemplate;
  readonly score: number;
}

export interface CandidateWindow {
  readonly tenantId: ContinuityTenantId;
  readonly candidates: readonly ContinuityCandidate[];
  readonly snapshot: PlanStoreSnapshot;
}

export interface PlanPlanInput {
  readonly tenantId: ContinuityTenantId;
  readonly requestedPriority?: ContinuityPlanTemplate['priority'];
}

const scoreCandidate = (plan: ContinuityPlanTemplate): number => {
  const riskPenalty = plan.tasks.length > 10 ? 0.1 : 0;
  const dependencyPenalty = plan.expectedDependencies.length * 0.03;
  return plan.priorityWeight - riskPenalty - dependencyPenalty;
};

const buildCandidate = (template: ContinuityPlanTemplate): ContinuityCandidate => ({
  template,
  score: scoreCandidate(template),
});

const flattenCandidates = (
  ranked: readonly (ContinuityPlanTemplate & { score: number })[],
): readonly ContinuityCandidate[] => ranked.map((item) => ({ template: item, score: item.score }));

export const assembleWindow = async (
  plans: readonly ContinuityPlanTemplate[],
  snapshotBuilder: PlanStoreSnapshotBuilder,
  tenantId: ContinuityTenantId,
): Promise<Result<CandidateWindow, Error>> => {
  const snapshot = await snapshotBuilder.materializeSnapshot(tenantId);
  if (!snapshot.ok) return fail(snapshot.error);

  const ranked = prioritizePlans(plans);
  const sorted = ranked
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority.localeCompare(left.priority);
      return right.score - left.score;
    });

  const ranking = rankTaskCriticality(plans);
  void ranking;

  return ok({
    tenantId,
    candidates: flattenCandidates(sorted),
    snapshot: snapshot.value,
  });
};

export interface RunAssembler {
  createRun(candidate: ContinuityCandidate, input: Omit<ContinuityRunInput, 'createdAt' | 'planId'>): ContinuityRunContext;
}

export class ContinuityRunAssembler implements RunAssembler {
  createRun(
    candidate: ContinuityCandidate,
    input: Omit<ContinuityRunInput, 'createdAt' | 'planId'>,
  ): ContinuityRunContext {
    const now = new Date().toISOString();

    return {
      runId: `${input.tenantId}-${Date.now()}` as ContinuityRunId,
      state: 'validated',
      tenantId: input.tenantId,
      planId: candidate.template.id,
      steps: candidate.template.tasks.map((task) => ({
        taskId: task.artifactId,
        status: 'pending',
        retryCount: 0,
      })),
      startedAt: now,
      deadlineAt: new Date(Date.now() + candidate.template.slaMinutes * 60 * 1000).toISOString(),
      trace: [`tenant:${input.tenantId}`, `plan:${candidate.template.id}`, `services:${input.targetServices.length}`],
    };
  }
}

export const detectExecutionRisk = (
  context: ContinuityRunContext,
  criticalityScores: readonly number[],
): string => {
  const trend = criticalityTrend(criticalityScores.map((score) => ({
    risk: {
      factor: score > 2 ? 'high' : 'low',
      weight: 0,
      explanation: 'computed',
    },
    score: score,
    runState: context.state,
    confidence: score > 0 ? 1 / score : 0,
  })));

  if (trend === 'degrading') return 'risk-elevating';
  if (trend === 'improving') return 'risk-stabilizing';
  return 'risk-neutral';
};

export const planInputFromTemplate = (
  tenantId: ContinuityPlanTemplate['tenantId'],
  runId: ContinuityRunId,
  targetServices: readonly string[],
): Omit<ContinuityRunInput, 'createdAt'> => ({
  runId,
  tenantId,
  planId: `${tenantId}-noop` as ContinuityRunInput['planId'],
  requestedWindow: {
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
    tz: 'UTC',
  },
  targetServices,
  dryRun: false,
});
