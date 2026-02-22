import type { PlanDraft, SimulationRun, OrchestrationContext } from './types';
import { summarizeConstraintMessages, evaluateConstraints, buildTimeline } from '@domain/incident-command-models';
import type { TimelineBucket } from '@domain/incident-command-models';

export interface PlanQuality {
  warningCount: number;
  riskScore: number;
  saturationScore: number;
  dependencyDensity: number;
  topWarnings: readonly string[];
}

export const scorePlan = (draft: PlanDraft): PlanQuality => {
  const warnings = draft.candidates.flatMap((candidate) => {
    const constraints = evaluateConstraints(candidate.command.constraints, {
      activePlanSize: draft.candidates.length,
      currentLoad: draft.plan.steps.length,
      tenantId: draft.plan.tenantId,
      criticalServices: ['identity', 'events'],
    });
    return summarizeConstraintMessages(constraints);
  });

  const uniqueWarnings = Array.from(new Set(warnings));
  const riskScore = draft.candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  const dependencyDensity = draft.plan.steps.reduce((sum, step) => sum + step.canRunWithParallelism, 0);

  const allWindows = draft.plan.steps.map((step) => step.scheduledWindow);
  const buckets = buildTimeline(allWindows, { bucketMinutes: 10, minDemand: 1 });
  const saturationScore = buckets
    .flatMap((entry) => entry.buckets)
    .reduce((sum, bucket: TimelineBucket) => sum + (bucket.saturated ? 1 : 0), 0);

  return {
    warningCount: warnings.length,
    riskScore,
    saturationScore,
    dependencyDensity,
    topWarnings: uniqueWarnings.slice(0, 12),
  };
};

export const summarizeSimulationRun = (context: OrchestrationContext, run: SimulationRun): string[] => [
  `tenant=${context.tenantId}`,
  `run=${context.runId}`,
  `signals=${run.signals.length}`,
  `created=${run.createdAt}`,
  `impactCount=${run.result.impacts.length}`,
  `residualRisk=${run.result.residualRisk.toFixed(2)}`,
];
