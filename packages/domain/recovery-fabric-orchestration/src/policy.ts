import type {
  FabricCommand,
  FabricConstraint,
  FabricExecutionContext,
  FabricPolicy,
  FabricReadinessLevel,
  FabricRiskBand,
} from './types';

export interface ConstraintEvaluation {
  readonly constraint: FabricConstraint;
  readonly isViolated: boolean;
  readonly detail: string;
}

export interface PolicyDecision {
  readonly policyId: FabricPolicy['id'];
  readonly approved: boolean;
  readonly readiness: FabricReadinessLevel;
  readonly riskBand: FabricRiskBand;
  readonly evaluations: readonly ConstraintEvaluation[];
  readonly reason: string;
}

const readinessScale: Record<FabricReadinessLevel, number> = {
  cold: 1,
  warm: 2,
  hot: 3,
  critical: 4,
};

const riskScale: Record<FabricRiskBand, number> = {
  green: 1,
  amber: 2,
  red: 3,
  black: 4,
};

export const estimateReadinessLevel = (commands: readonly FabricCommand[]): FabricReadinessLevel => {
  const blastRadius = commands.reduce((sum, command) => sum + command.blastRadius, 0) / Math.max(commands.length, 1);
  const priority = commands.reduce((sum, command) => sum + command.priority, 0) / Math.max(commands.length, 1);
  const score = Math.max(0, 100 - blastRadius * 2 - priority * 8);
  if (score >= 90) {
    return 'critical';
  }
  if (score >= 70) {
    return 'hot';
  }
  if (score >= 40) {
    return 'warm';
  }
  return 'cold';
};

export const estimateRiskBand = (
  readiness: FabricReadinessLevel,
  maxRetries: number,
  requiresApprovals: number,
): FabricRiskBand => {
  const score = readinessScale[readiness];
  if (maxRetries >= 8 || requiresApprovals >= 4) {
    return 'black';
  }
  if (score > 3 || requiresApprovals > 2) {
    return 'red';
  }
  if (score >= 2 || maxRetries > 3) {
    return 'amber';
  }
  return 'green';
};

export const evaluateCommandConstraints = (
  command: FabricCommand,
  context: FabricExecutionContext,
  policy: FabricPolicy,
): readonly ConstraintEvaluation[] => {
  return command.constraints.map((constraint) => {
    const signalPressure = context.signals.length > 0 ? 'amber' : 'green';
    const riskAcceptable = riskScale[signalPressure] <= riskScale[constraint.requiredWhen];
    const withinWindow = command.requiresWindows.every((window) => {
      const timestamp = Date.parse(context.incident.updatedAt);
      return timestamp >= Date.parse(window.startsAt) && timestamp <= Date.parse(window.endsAt);
    });
    const maxParallelismOk = command.blastRadius <= policy.maxParallelism;
    const isViolated = !riskAcceptable || !withinWindow || !maxParallelismOk;

    return {
      constraint,
      isViolated,
      detail: isViolated
        ? [
            !riskAcceptable ? 'risk exceeds signal tolerance' : '',
            !maxParallelismOk ? 'blast radius above policy max-parallelism' : '',
            !withinWindow ? 'incident outside command window' : '',
          ].filter(Boolean).join('; ')
        : 'constraints satisfied',
    };
  });
};

export const decidePolicy = (
  policy: FabricPolicy,
  context: FabricExecutionContext,
  commands: readonly FabricCommand[],
): PolicyDecision => {
  const readiness = estimateReadinessLevel(commands);
  const requiresApprovals = commands.reduce((sum, command) => sum + command.requiresApprovals, 0);
  const evaluations = commands.flatMap((command) => evaluateCommandConstraints(command, context, policy));
  const riskBand = estimateRiskBand(readiness, policy.maxRetries, requiresApprovals);
  const blocked = evaluations.some((item) => item.isViolated);
  const policyReadiness = readinessScale[readiness];
  const minimumReadiness = readinessScale[policy.readinessThreshold];

  return {
    policyId: policy.id,
    approved: !blocked && policyReadiness >= minimumReadiness && riskBand !== 'black',
    readiness,
    riskBand,
    evaluations,
    reason: blocked ? 'policy violations detected' : 'all policy constraints satisfied',
  };
};

export const evaluateReadiness = estimateReadinessLevel;
