import {
  asScenarioConstraintId,
  type PolicyEvaluationResult,
  type ScenarioBlueprint,
  type ScenarioConstraint,
  type ScenarioPolicyInput,
  type ScenarioProfile,
  type ScoreSummary,
  type ScoreVector,
} from './types';

export interface PolicyRegistry {
  readonly policies: readonly ScenarioPolicyInput[];
}

export interface EvaluatedPolicy {
  readonly policyId: string;
  readonly policyName: string;
  readonly input: ScenarioPolicyInput;
  readonly result: PolicyEvaluationResult;
}

export interface DomainPolicyContext {
  readonly profile: ScenarioProfile;
  readonly signals: readonly string[];
  readonly commandCount: number;
  readonly hasManualIntervention: boolean;
}

export const evaluateScenarioPolicy = (
  profile: ScenarioProfile,
  blueprint: ScenarioBlueprint,
  context: DomainPolicyContext,
): PolicyEvaluationResult[] => {
  const results: PolicyEvaluationResult[] = [];

  const maxParallelismAllowed = context.hasManualIntervention ? profile.maxParallelism + 2 : profile.maxParallelism;
  results.push({
    policyId: `${profile.profileId}:parallelism`,
    passed: blueprint.windowMinutes <= maxParallelismAllowed * 5,
    reason: blueprint.windowMinutes <= maxParallelismAllowed * 5 ? 'parallelism budget respected' : 'parallelism exceeds profile constraints',
    adjustedLimit: maxParallelismAllowed * 5,
  });

  const blastOk = blueprint.commands.every((command) => command.blastRadius <= profile.maxBlastRadius);
  results.push({
    policyId: `${profile.profileId}:blast`,
    passed: blastOk,
    reason: blastOk ? 'all command blast radii within policy limits' : 'blast policy violation',
  });

  const allowedDuration = Number(profile.maxRuntimeMs);
  const estimatedRuntime = blueprint.commands.reduce((total, command) => total + command.estimatedDurationMs, 0);
  const runtimeOk = estimatedRuntime <= allowedDuration;
  results.push({
    policyId: `${profile.profileId}:runtime`,
    passed: runtimeOk,
    reason: runtimeOk ? `runtime ${estimatedRuntime} within max ${allowedDuration}` : `runtime ${estimatedRuntime} above max ${allowedDuration}`,
    adjustedLimit: runtimeOk ? undefined : allowedDuration,
  });

  return results;
};

export const buildConstraintsFromBlueprint = (
  blueprint: ScenarioBlueprint,
  context: DomainPolicyContext,
): ScenarioConstraint[] => {
  const constraints: ScenarioConstraint[] = [];
  const maxParallelism = context.hasManualIntervention ? context.commandCount + 1 : context.commandCount;
  constraints.push({
    constraintId: asScenarioConstraintId(`${String(blueprint.scenarioId)}:max_parallelism:0`),
    type: 'max_parallelism',
    description: 'Max commands running simultaneously',
    severity: 'error',
    commandIds: blueprint.commands.map((command) => command.commandId),
    limit: maxParallelism,
  });

  constraints.push({
    constraintId: asScenarioConstraintId(`${String(blueprint.scenarioId)}:region_gate:0`),
    type: 'region_gate',
    description: 'Only execute during selected region window',
    severity: 'warning',
    commandIds: blueprint.commands.map((command) => command.commandId),
    limit: 1,
  });

  if (context.hasManualIntervention) {
    constraints.push({
      constraintId: asScenarioConstraintId(`${String(blueprint.scenarioId)}:must_complete_before:0`),
      type: 'must_complete_before',
      description: 'Manual override should complete before incident window close',
      severity: 'warning',
      commandIds: blueprint.commands.slice(0, 2).map((command) => command.commandId),
      limit: blueprint.windowMinutes * 60 * 1000,
    });
  }

  return constraints;
};

export const evaluatePolicySummary = (evaluations: PolicyEvaluationResult[]): ScoreSummary => {
  const weights = {
    completeness: 0,
    safety: 0,
    speed: 0,
    blastMitigation: 0,
    governance: 0,
  } satisfies ScoreVector;

  const total = evaluations.length;
  let warningCount = 0;
  let passCount = 0;

  for (const evaluation of evaluations) {
    if (evaluation.passed) {
      passCount += 1;
      weights.completeness += 1;
      weights.governance += 1;
    } else {
      warningCount += 1;
    }
    weights.speed += evaluation.adjustedLimit ? 0.5 : 1;
    weights.safety += evaluation.reason.length / 100;
    weights.blastMitigation += evaluation.passed ? 1 : 0.25;
  }

  const divisor = Math.max(total, 1);
  const dimensions: ScoreVector = {
    completeness: weights.completeness / divisor,
    safety: Math.max(0, Math.min(1, weights.safety / divisor)),
    speed: Math.max(0, Math.min(1, weights.speed / divisor)),
    blastMitigation: weights.blastMitigation / divisor,
    governance: weights.governance / divisor,
  };

  return {
    overall: passCount / divisor,
    dimensions,
    details: {
      passed: passCount,
      warningCount,
      policyFailures: total - passCount,
    },
  };
};
