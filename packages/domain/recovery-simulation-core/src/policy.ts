import type {
  SimulationScenarioBlueprint,
  SimulationPlanManifest,
  SimulationState,
} from './types';

export interface SimulationPolicy {
  readonly name: string;
  readonly allowParallelism: boolean;
  readonly maxWallClockMinutes: number;
  readonly maxIncidentTolerance: number;
  readonly allowedRiskSurfaces: readonly string[];
  readonly mustCompleteStepRatio: number;
  readonly maxRetriesPerStep: number;
}

export interface SimulationPolicyViolation {
  readonly policyName: string;
  readonly message: string;
  readonly stepTitle?: string;
}

export interface SimulationPolicyEvaluation {
  readonly pass: boolean;
  readonly violations: readonly SimulationPolicyViolation[];
  readonly effectiveDurationMs: number;
}

export const buildDefaultPolicy = (): SimulationPolicy => ({
  name: 'standard-simulation-policy',
  allowParallelism: true,
  maxWallClockMinutes: 45,
  maxIncidentTolerance: 2,
  allowedRiskSurfaces: ['infra', 'app', 'data'],
  mustCompleteStepRatio: 0.82,
  maxRetriesPerStep: 2,
});

export const enforcePolicyOnScenario = (
  scenario: SimulationScenarioBlueprint,
  policy: SimulationPolicy,
): SimulationPolicyEvaluation => {
  const violations: SimulationPolicyViolation[] = [];

  for (const step of scenario.steps) {
    if (!policy.allowedRiskSurfaces.includes(step.riskSurface)) {
      violations.push({
        policyName: policy.name,
        message: `step ${step.title} uses unsupported risk surface ${step.riskSurface}`,
        stepTitle: step.title,
      });
    }
  }

  const estimatedMs = scenario.steps.reduce((sum, step) => sum + step.expectedDurationMs, 0);
  if (estimatedMs > policy.maxWallClockMinutes * 60_000) {
    violations.push({
      policyName: policy.name,
      message: `estimated duration ${estimatedMs}ms exceeds maximum ${policy.maxWallClockMinutes} minutes`,
    });
  }

  return {
    pass: violations.length === 0,
    violations,
    effectiveDurationMs: policy.allowParallelism ? estimatedMs / 1.9 : estimatedMs,
  };
};

export const tuneConcurrency = (manifest: SimulationPlanManifest, policy: SimulationPolicy): SimulationPlanManifest => ({
  ...manifest,
  concurrencyLimit: policy.allowParallelism
    ? Math.min(8, Math.max(1, Math.floor(policy.maxWallClockMinutes / 5)))
    : 1,
});

export const canPauseFrom = (state: SimulationState): boolean =>
  state === 'executing' || state === 'stalled';

export const isCriticalPolicy = (policy: SimulationPolicy): boolean => policy.maxIncidentTolerance <= 1;
