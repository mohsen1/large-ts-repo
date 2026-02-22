import type { RecoveryProgram, RecoveryRunState } from './types';
import { buildStrategyAllocation, summarizeConstraint } from './strategy-lanes';
import { withBrand } from '@shared/core';

export type ImpactBand = 'minimal' | 'moderate' | 'high' | 'severe';

export interface DeploymentImpactProfile {
  readonly tenant: ReturnType<typeof withBrand>;
  readonly impactBand: ImpactBand;
  readonly confidence: number;
  readonly projectedOutageMinutes: number;
  readonly commandCount: number;
  readonly laneDistribution: Record<string, number>;
  readonly constraints: readonly string[];
  readonly recommendation: string;
}

const impactBandFromOutage = (minutes: number): ImpactBand => {
  if (minutes >= 180) return 'severe';
  if (minutes >= 90) return 'high';
  if (minutes >= 45) return 'moderate';
  return 'minimal';
};

const confidenceFromBand = (band: ImpactBand): number => {
  switch (band) {
    case 'minimal':
      return 0.95;
    case 'moderate':
      return 0.82;
    case 'high':
      return 0.67;
    default:
      return 0.51;
  }
};

const projectedOutageFromProfile = (program: RecoveryProgram, runState?: RecoveryRunState): number => {
  const lanes = buildStrategyAllocation(program);
  const baseBySteps = Math.max(10, program.steps.length * 4);
  const retryPenalty = lanes.reduce((sum, entry) => sum + entry.maxRetries * 2, 0);
  const runPenalty = runState?.estimatedRecoveryTimeMinutes ?? 0;
  return baseBySteps + retryPenalty + runPenalty;
};

export const buildDeploymentImpactProfile = (
  program: RecoveryProgram,
  runState?: RecoveryRunState,
): DeploymentImpactProfile => {
  const projectedOutageMinutes = projectedOutageFromProfile(program, runState);
  const impactBand = impactBandFromOutage(projectedOutageMinutes);
  const allocations = buildStrategyAllocation(program);
  const laneDistribution: Record<string, number> = {};

  for (const allocation of allocations) {
    laneDistribution[allocation.lane] = (laneDistribution[allocation.lane] ?? 0) + 1;
  }

  const recommendation =
    impactBand === 'severe'
      ? 'Pause run. Activate rollback safety gates and expand dry-run windows.'
      : impactBand === 'high'
        ? 'Run in phased mode and require pre-approval on all customer-facing lanes.'
        : 'Run in standard mode with post-step audit checkpoints.';

  return {
    tenant: withBrand(String(program.tenant), 'TenantId'),
    impactBand,
    confidence: confidenceFromBand(impactBand),
    projectedOutageMinutes,
    commandCount: program.steps.length,
    laneDistribution,
    constraints: [summarizeConstraint(program.constraints)],
    recommendation,
  };
};

export const compareProfiles = (left: DeploymentImpactProfile, right: DeploymentImpactProfile): number => {
  if (left.impactBand === right.impactBand) {
    return left.projectedOutageMinutes - right.projectedOutageMinutes;
  }
  const rank = { minimal: 0, moderate: 1, high: 2, severe: 3 } as const;
  return rank[left.impactBand] - rank[right.impactBand];
};

export const profileToSummary = (profile: DeploymentImpactProfile): string =>
  `${profile.impactBand}: ${profile.projectedOutageMinutes}m (${profile.commandCount} cmds) conf=${profile.confidence.toFixed(2)}`;
