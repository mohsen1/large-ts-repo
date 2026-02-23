import type { Result } from '@shared/result';
import { ok } from '@shared/result';
import type {
  SimulationPlan,
  SimulationAllocation,
  SimulationConstraint,
  SimulationPolicyViolation,
  SimulationSummary,
  SimulationWindow,
} from './types';

export interface PlanSummaryMetrics {
  readonly planRunId: string;
  readonly runId: string;
  readonly waves: number;
  readonly totalSignals: number;
  readonly coverage: number;
  readonly riskScore: number;
}

export interface PlanHeatPoint {
  readonly waveId: string;
  readonly minute: SimulationWindow['windowIndex'];
  readonly normalizedCoverage: number;
  readonly normalizedRisk: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const estimateCoverage = (summary: SimulationSummary): number =>
  clamp((summary.signalCoverage + summary.nodeCoverage + summary.coverageRatio) / 3);

const estimateRisk = (summary: SimulationSummary): number => {
  if (summary.riskProfile === 'red') return 1;
  if (summary.riskProfile === 'amber') return 0.55;
  return 0.2;
};

export const summarizePlan = (plan: SimulationPlan): Result<PlanSummaryMetrics, Error> => {
  return ok({
    planRunId: plan.runId,
    runId: plan.runId,
    waves: plan.waves.length,
    totalSignals: plan.projectedSignals.reduce((count, point) => count + point.signals, 0),
    coverage: Number(estimateCoverage(plan.summary).toFixed(4)),
    riskScore: Number((1 - estimateRisk(plan.summary)).toFixed(4)),
  });
};

export const deriveHeatMap = (plan: SimulationPlan): PlanHeatPoint[] =>
  plan.waves.map((wave) => ({
    waveId: wave.id,
    minute: wave.window.windowIndex,
    normalizedCoverage: clamp(wave.signalCount / Math.max(1, plan.projectedSignals.length)),
    normalizedRisk: clamp(1 - clamp(wave.signalCount / Math.max(1, wave.window.expectedSignals || 1))),
  }));

export const rankPlanSignals = (allocations: readonly SimulationAllocation[]): readonly SimulationAllocation[] =>
  [...allocations].sort((left, right) => right.coverageRatio - left.coverageRatio);

export const evaluateConstraintFit = (
  constraints: SimulationConstraint,
  summary: SimulationSummary,
): { readonly acceptable: boolean; readonly violations: readonly SimulationPolicyViolation[] } => {
  const signalDensity = summary.signalCoverage / Math.max(1, constraints.maxSignalsPerWave);
  const violations: SimulationPolicyViolation[] = [];
  if (signalDensity < constraints.minWindowCoverage) {
    violations.push({ reason: 'low-coverage', nodeId: 'coverage', severity: 2 });
  }
  if (summary.riskProfile === 'red') {
    violations.push({ reason: 'risk-profile-red', nodeId: 'summary', severity: 4 });
  }
  return {
    acceptable: violations.length === 0,
    violations,
  };
};
