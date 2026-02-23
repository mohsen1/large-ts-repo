import type {
  CommandCandidatePolicy,
  CommandPolicyViolation,
  CommandPlanProfile,
  CommandRisk,
} from './types';

type CommandPhasePolicy = {
  readonly phase: string;
  readonly minSignalConfidence: number;
  readonly maxStepAgeMinutes: number;
  readonly requireOwner: boolean;
};

const riskScale: Record<CommandRisk, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const normalizeRisk = (risk: CommandRisk): number => riskScale[risk];

export const rankRisk = (risk: CommandRisk): number => riskScale[risk];

export const satisfiesRiskTolerance = (risk: CommandRisk, maxRisk: number): boolean => {
  return normalizeRisk(risk) <= maxRisk;
};

export const buildPolicyViolations = (
  plan: CommandPlanProfile,
  policy: CommandCandidatePolicy,
  waveCount: number,
  maxRisk: CommandRisk,
): readonly CommandPolicyViolation[] => {
  const blockers: CommandPolicyViolation[] = [];

  if (waveCount > policy.maxConcurrentCommands) {
    blockers.push({
      code: 'policy:parallelism',
      reason: `concurrency ${waveCount} exceeds max ${policy.maxConcurrentCommands}`,
      severity: 'hard',
    });
  }

  if (!satisfiesRiskTolerance(plan.riskLevel, normalizeRisk(maxRisk))) {
    blockers.push({
      code: 'policy:risk',
      reason: `plan risk ${plan.riskLevel} exceeds max ${maxRisk}`,
      severity: 'hard',
    });
  }

  if (policy.requiresApproval && plan.riskLevel !== 'critical') {
    blockers.push({
      code: 'policy:approval',
      reason: 'critical-risk approval workflow required for high-confidence command sets',
      severity: 'guardrail',
    });
  }

  return blockers;
};

export const evaluateWavePolicy = (
  phasePolicies: readonly CommandPhasePolicy[],
  signalConfidence: number,
): readonly CommandPolicyViolation[] => {
  const violations: CommandPolicyViolation[] = [];

  for (const phasePolicy of phasePolicies) {
    if (signalConfidence < phasePolicy.minSignalConfidence) {
      violations.push({
        code: `policy:${phasePolicy.phase}:confidence`,
        reason: `signal confidence ${signalConfidence} below minimum ${phasePolicy.minSignalConfidence}`,
        severity: 'guardrail',
      });
    }

    if (phasePolicy.requireOwner && !phasePolicy.phase) {
      violations.push({
        code: `policy:${phasePolicy.phase}:owner`,
        reason: 'phase policy requires command owner assignment',
        severity: 'advisory',
      });
    }
  }

  return violations;
};

export const isPlanAllowed = (
  plan: CommandPlanProfile,
  policy: CommandCandidatePolicy,
  phasePolicies: readonly CommandPhasePolicy[],
  signalConfidence: number,
): boolean => {
  const violations = [
    ...buildPolicyViolations(plan, policy, plan.waves.length, policy.maxRiskLevel),
    ...evaluateWavePolicy(phasePolicies, signalConfidence),
  ];

  return !violations.some((entry) => entry.severity === 'hard');
};

export const summarizePolicy = (
  plan: CommandPlanProfile,
  policy: CommandCandidatePolicy,
  averageConfidence: number,
): { readonly allowed: boolean; readonly reasons: readonly string[] } => {
  const violations = buildPolicyViolations(plan, policy, plan.waves.length, policy.maxRiskLevel);
  const phasePolicies: CommandPhasePolicy[] = [
    {
      phase: 'observe',
      minSignalConfidence: 0.5,
      maxStepAgeMinutes: 30,
      requireOwner: true,
    },
    {
      phase: 'stabilize',
      minSignalConfidence: 0.75,
      maxStepAgeMinutes: 45,
      requireOwner: true,
    },
    {
      phase: 'validate',
      minSignalConfidence: 0.8,
      maxStepAgeMinutes: 10,
      requireOwner: false,
    },
  ];

  const evaluation = evaluateWavePolicy(
    phasePolicies,
    averageConfidence,
  );

  return {
    allowed: isPlanAllowed(plan, policy, phasePolicies, averageConfidence),
    reasons: [...violations, ...evaluation].map((item) => item.reason),
  };
};
