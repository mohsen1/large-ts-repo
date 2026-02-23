import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { SimulationConstraint, SimulationPlan, SimulationPolicyViolation, SimulationSummary } from './types';
import { makeSimulationRunId } from './types';

export interface StabilityCell {
  readonly dimension: string;
  readonly value: number;
  readonly weight: number;
  readonly reason: string;
}

export interface StabilityMatrix {
  readonly runId: string;
  readonly cells: readonly StabilityCell[];
  readonly riskScore: number;
  readonly signalCoverageScore: number;
  readonly operatorMixScore: number;
  readonly violations: readonly SimulationPolicyViolation[];
}

export interface MatrixEnvelope {
  readonly createdAt: string;
  readonly matrix: StabilityMatrix;
  readonly summary: SimulationSummary;
  readonly fusionSignals: readonly unknown[];
}

const weights: ReadonlyArray<{ dimension: string; weight: number }> = [
  { dimension: 'coverage', weight: 0.35 },
  { dimension: 'risk', weight: 0.25 },
  { dimension: 'parallelism', weight: 0.2 },
  { dimension: 'blackout', weight: 0.2 },
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const buildCoverageCell = (summary: SimulationSummary): StabilityCell => ({
  dimension: 'coverage',
  value: clamp((summary.signalCoverage + summary.nodeCoverage + summary.coverageRatio) / 3),
  weight: 0.35,
  reason: `signalCoverage=${summary.signalCoverage},nodeCoverage=${summary.nodeCoverage}`,
});

const buildRiskCell = (summary: SimulationSummary, constraints: SimulationConstraint): StabilityCell => ({
  dimension: 'risk',
  value: clamp(1 - (summary.policyViolations.length / Math.max(1, constraints.maxRiskScore))),
  weight: 0.25,
  reason: `violations=${summary.policyViolations.length}`,
});

const buildParallelismCell = (summary: SimulationSummary, constraints: SimulationConstraint): StabilityCell => ({
  dimension: 'parallelism',
  value: clamp(summary.coverageRatio / Math.max(1, constraints.maxParallelNodes)),
  weight: 0.2,
  reason: `nodeCoverage=${summary.nodeCoverage}/target=${constraints.maxParallelNodes}`,
});

const buildBlackoutCell = (constraints: SimulationConstraint): StabilityCell => ({
  dimension: 'blackout',
  value: clamp(1 - Math.min(1, constraints.blackoutWindows.length / 5)),
  weight: 0.2,
  reason: `blackoutWindows=${constraints.blackoutWindows.length}`,
});

export const buildStabilityMatrix = (summary: SimulationSummary, constraints: SimulationConstraint): StabilityMatrix => {
  const cells = [
    buildCoverageCell(summary),
    buildRiskCell(summary, constraints),
    buildParallelismCell(summary, constraints),
    buildBlackoutCell(constraints),
  ];

  const riskScore = cells.reduce((sum, cell) => sum + cell.value * cell.weight, 0);
  const signalCoverageScore = clamp(cells.find((cell) => cell.dimension === 'coverage')?.value ?? 0);
  const operatorMixScore = clamp(cells.find((cell) => cell.dimension === 'parallelism')?.value ?? 0);

  return {
    runId: summary.runId,
    cells,
    riskScore: Number(riskScore.toFixed(4)),
    signalCoverageScore,
    operatorMixScore,
    violations: summary.policyViolations,
  };
};

export const buildEnvelope = (
  plan: SimulationPlan,
  constraints: SimulationConstraint,
  fusionSignals: readonly unknown[] = [],
): Result<MatrixEnvelope, Error> => {
  if (plan.waves.length === 0) {
    return fail(new Error('empty-plan'));
  }
  return ok({
    createdAt: new Date().toISOString(),
    matrix: buildStabilityMatrix(plan.summary, constraints),
    summary: plan.summary,
    fusionSignals,
  });
};

export const scoreFromMatrix = (matrix: StabilityMatrix): number => {
  return Number(matrix.cells.reduce((sum, cell) => sum + cell.value * cell.weight, 0).toFixed(4));
};

export const evaluateFusionAlignment = (runId: string, matrix: StabilityMatrix): string[] =>
  matrix.violations.map((violation) => `fusion-${runId}-${violation.reason}`);

export const asRunId = (runId: string): string => makeSimulationRunId(runId);
