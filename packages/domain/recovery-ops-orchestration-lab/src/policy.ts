import type {
  LabSignalTier,
  OrchestrationPolicy,
  PlanScore,
  OrchestrationLab,
  LabPlan,
  TimelineSegment,
} from './types';

export interface PolicyViolation {
  readonly code: string;
  readonly description: string;
  readonly severity: LabSignalTier;
  readonly blocked: boolean;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

export const scorePlan = (plan: LabPlan, policy: OrchestrationPolicy): PlanScore => {
  const riskValues = plan.steps.map((step) => step.risk);
  const dependencyPressure = plan.steps.filter((step) => step.dependencies.length > 0).length;
  const reversibleCount = plan.steps.filter((step) => step.reversible).length;

  const complexity = clamp(plan.steps.length * 4 + dependencyPressure * 6 + average(riskValues) * 3 + policy.timeoutMinutes / 10);
  const resilience = clamp(110 - average(riskValues) * 5 - dependencyPressure * 1.5 + reversibleCount * 6);
  const readiness = clamp(100 - complexity + plan.score * 2);
  const controlImpact = clamp(plan.score * 1.2 - average(riskValues) * 3 + policy.allowedTiers.length * 5);

  return {
    labId: plan.labId,
    planId: plan.id,
    readiness: Number(readiness.toFixed(2)),
    resilience: Number(resilience.toFixed(2)),
    complexity,
    controlImpact: Number(controlImpact.toFixed(2)),
    timestamp: new Date().toISOString(),
  };
};

export const evaluatePolicy = (policy: OrchestrationPolicy, plan: LabPlan): { readonly allowed: boolean; readonly violations: readonly PolicyViolation[] } => {
  const violations: PolicyViolation[] = [];

  if (plan.steps.length > policy.maxParallelSteps * 6) {
    violations.push({
      code: 'max-step-capacity',
      description: `plan has ${plan.steps.length} steps, exceeds policy max ${policy.maxParallelSteps}`,
      severity: 'critical',
      blocked: true,
    });
  }

  if (plan.confidence < policy.minConfidence) {
    violations.push({
      code: 'low-confidence',
      description: `confidence ${plan.confidence} below min ${policy.minConfidence}`,
      severity: 'warning',
      blocked: false,
    });
  }

  if (plan.steps.every((step) => step.risk > 7)) {
    violations.push({
      code: 'high-risk-plan',
      description: 'all steps exceed risk threshold',
      severity: 'critical',
      blocked: true,
    });
  }

  const runtime = plan.steps.reduce((acc, step) => acc + step.expectedMinutes, 0);
  if (runtime > policy.timeoutMinutes) {
    violations.push({
      code: 'timeout-limit',
      description: `estimated runtime ${runtime} exceeds limit ${policy.timeoutMinutes}`,
      severity: 'warning',
      blocked: false,
    });
  }

  return {
    allowed: !violations.some((violation) => violation.blocked),
    violations,
  };
};

export const synthesizeSegments = (lab: OrchestrationLab, plan: LabPlan): readonly TimelineSegment[] => {
  const sorted = [...plan.steps].sort((left, right) => left.expectedMinutes - right.expectedMinutes);
  const segments: TimelineSegment[] = [];
  let cursor = new Date(lab.updatedAt);

  for (const step of sorted) {
    const from = cursor.toISOString();
    const to = new Date(cursor.getTime() + step.expectedMinutes * 60_000).toISOString();
    cursor = new Date(to);

    const health = Math.max(0, 100 - step.risk * 9 + (step.reversible ? 8 : 0));
    segments.push({
      from,
      to,
      label: `${step.name} (${step.type})`,
      steps: [step.id, ...step.tags],
      health: Number(health.toFixed(1)),
    });
  }

  return segments;
};

export const signalSignalRisk = (signals: OrchestrationLab['signals']): number => {
  if (signals.length === 0) {
    return 0;
  }

  const value = signals.reduce((acc, signal) => {
    if (signal.tier === 'critical') {
      return acc + 3;
    }
    if (signal.tier === 'warning') {
      return acc + 1.5;
    }
    return acc + 1;
  }, 0);

  return Number((value / signals.length).toFixed(2));
};
