import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { SimulationConstraint, SimulationPlanInput, SimulationPolicyViolation } from './types';
import { defaultConstraint, normalizeConstraint } from './types';

export type ConstraintMode = 'strict' | 'balanced' | 'aggressive';

export interface ConstraintEnvelope {
  readonly requested: SimulationConstraint;
  readonly normalized: SimulationConstraint;
  readonly mode: ConstraintMode;
  readonly applied: readonly string[];
}

export interface ConstraintDecision {
  readonly envelope: ConstraintEnvelope;
  readonly valid: boolean;
  readonly violations: readonly SimulationPolicyViolation[];
}

const applyModeAdjustments = (input: SimulationConstraint, mode: ConstraintMode): SimulationConstraint => {
  switch (mode) {
    case 'strict':
      return {
        ...input,
        maxSignalsPerWave: Math.max(1, Math.ceil(input.maxSignalsPerWave * 0.65)),
        maxParallelNodes: Math.max(1, Math.floor(input.maxParallelNodes * 0.8)),
        minWindowCoverage: Math.min(1, input.minWindowCoverage + 0.2),
        maxRiskScore: Math.max(1, Math.floor(input.maxRiskScore * 0.85)),
      };
    case 'aggressive':
      return {
        ...input,
        maxSignalsPerWave: Math.max(1, Math.ceil(input.maxSignalsPerWave * 1.4)),
        maxParallelNodes: Math.max(1, Math.ceil(input.maxParallelNodes * 1.2)),
        minWindowCoverage: Math.max(0, input.minWindowCoverage - 0.08),
        maxRiskScore: Math.max(1, Math.floor(input.maxRiskScore * 1.35)),
      };
    default:
      return input;
  }
};

const validateConstraint = (constraint: SimulationConstraint): SimulationPolicyViolation[] => {
  const violations: SimulationPolicyViolation[] = [];
  if (constraint.maxSignalsPerWave <= 0) {
    violations.push({ reason: 'maxSignalsPerWave-must-be-positive', nodeId: 'global', severity: 5 });
  }
  if (constraint.maxParallelNodes <= 0) {
    violations.push({ reason: 'maxParallelNodes-must-be-positive', nodeId: 'global', severity: 4 });
  }
  if (constraint.minWindowCoverage < 0 || constraint.minWindowCoverage > 1) {
    violations.push({ reason: 'minWindowCoverage-range-error', nodeId: 'global', severity: 4 });
  }
  if (constraint.maxRiskScore < 1) {
    violations.push({ reason: 'maxRiskScore-negative', nodeId: 'global', severity: 5 });
  }
  if (constraint.blackoutWindows.length > 2) {
    violations.push({ reason: 'too-many-blackout-windows', nodeId: 'window', severity: 2 });
  }
  return violations;
};

export const buildConstraintEnvelope = (
  request: SimulationConstraint | undefined,
  mode: ConstraintMode = 'balanced',
  targetCount: number = 1,
): ConstraintEnvelope => {
  const normalized = normalizeConstraint(request ?? defaultConstraint(targetCount));
  const adjusted = applyModeAdjustments(normalized, mode);
  const applied = [
    `mode:${mode}`,
    `maxSignalsPerWave:${adjusted.maxSignalsPerWave}`,
    `maxParallelNodes:${adjusted.maxParallelNodes}`,
    `minWindowCoverage:${adjusted.minWindowCoverage}`,
  ];
  return {
    requested: normalized,
    normalized: adjusted,
    mode,
    applied,
  };
};

export const validatePlanConstraints = (
  input: SimulationPlanInput,
  mode: ConstraintMode = 'balanced',
): Result<ConstraintDecision, Error> => {
  const envelope = buildConstraintEnvelope(input.constraints, mode, input.draft.targetIds.length);
  const violations = validateConstraint(envelope.normalized);
  if (violations.length > 0) {
    return fail(new Error(`constraint-violations:${violations.map((value) => value.reason).join(',')}`));
  }
  return ok({
    envelope,
    valid: true,
    violations,
  });
};

export const mergeConstraints = (left: SimulationConstraint, right: SimulationConstraint): SimulationConstraint => ({
  maxSignalsPerWave: Math.max(left.maxSignalsPerWave, right.maxSignalsPerWave),
  maxParallelNodes: Math.max(left.maxParallelNodes, right.maxParallelNodes),
  blackoutWindows: [...left.blackoutWindows, ...right.blackoutWindows],
  minWindowCoverage: Math.min(left.minWindowCoverage, right.minWindowCoverage),
  maxRiskScore: Math.min(left.maxRiskScore, right.maxRiskScore),
});
