import { chunkIterable, collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import type { ConvergenceConstraint, ConvergenceStage, ConvergenceRunId, ConvergenceOutput } from './types';
import type { RecoverySimulationResult, CommandRunbook } from '@domain/recovery-stress-lab';

export interface SimulationDigest {
  readonly runId: ConvergenceRunId;
  readonly runbookCount: number;
  readonly signalDensity: number;
  readonly risk: number;
  readonly confidence: number;
}

export interface ConstraintDigest {
  readonly scope: ConvergenceConstraint['scope'];
  readonly activeCount: number;
  readonly averageWeight: number;
}

export interface ConvergenceReportLine {
  readonly kind: 'simulation' | 'runbook' | 'constraint';
  readonly message: string;
  readonly score: number;
}

export const simulationToDigest = (
  runId: ConvergenceRunId,
  simulation: RecoverySimulationResult,
  constraints: readonly ConvergenceConstraint[],
): SimulationDigest => {
  const signalDensity = simulation.ticks.length === 0 ? 0 : simulation.notes.length / Math.max(1, simulation.ticks.length);
  const weighted = constraints.reduce((sum, constraint) => sum + constraint.weight, 0);
  const risk = Math.max(0, Math.min(1, simulation.riskScore / 100));

  return {
    runId,
    runbookCount: simulation.selectedRunbooks.length,
    signalDensity,
    risk,
    confidence: Math.max(0, Math.min(1, simulation.slaCompliance)),
  };
};

export const buildConstraintDigest = (
  constraints: readonly ConvergenceConstraint[],
): readonly ConstraintDigest[] => {
  const buckets = new Map<string, { active: number; weight: number; total: number }>();

  for (const constraint of constraints) {
    const next = buckets.get(constraint.scope) ?? { active: 0, weight: 0, total: 0 };
    next.total += 1;
    next.weight += constraint.active ? constraint.weight : 0;
    if (constraint.active) {
      next.active += 1;
    }
    buckets.set(constraint.scope, next);
  }

  return collectIterable(mapIterable(buckets.entries(), ([scope, bucket]) => ({
    scope: scope as ConvergenceConstraint['scope'],
    activeCount: bucket.active,
    averageWeight: bucket.total === 0 ? 0 : bucket.weight / bucket.total,
  })));
};

export const summarizeConstraints = (
  constraints: readonly ConvergenceConstraint[],
): string[] =>
  constraints
    .filter((constraint) => constraint.active)
    .map((constraint) => `${constraint.scope}:${constraint.key}`);

export const summarizeTrace = (stages: readonly ConvergenceStage[]): readonly string[] => stages.map((stage) => `trace:${stage}`);

export const selectRunbooksByStage = (
  runbooks: readonly CommandRunbook[],
  stage: ConvergenceStage,
): readonly CommandRunbook[] => {
  const chunks = collectIterable(chunkIterable(runbooks, 2));
  const selected = chunks
    .flatMap((chunk) => chunk)
    .filter((runbook) => runbook.ownerTeam.length > 0)
    .filter((_, index) => {
      if (stage === 'input') return index < 1;
      if (stage === 'resolve') return index < 3;
      if (stage === 'simulate') return index < 5;
      if (stage === 'recommend') return index < 4;
      return index < 2;
    });

  return selected;
};

export const adaptConvergenceOutput = <TStage extends ConvergenceOutput['stage']>(
  output: ConvergenceOutput<TStage>,
  runId: ConvergenceRunId,
): readonly ConvergenceReportLine[] => {
  const summary = output.simulation ? simulationToDigest(runId, output.simulation, []) : null;
  const chunks = collectIterable(chunkIterable(output.diagnostics, 2));

  const lines: ConvergenceReportLine[] = [
    {
      kind: 'runbook',
      message: `runId:${output.runId} stage:${output.stage}`,
      score: output.score,
    },
    {
      kind: 'simulation',
      message: `confidence:${output.confidence}`,
      score: output.confidence,
    },
  ];

  if (summary) {
    lines.push({
      kind: 'simulation',
      message: `runbooks:${summary.runbookCount} risk:${summary.risk.toFixed(2)}`,
      score: summary.risk,
    });
  }

  for (const [index, chunk] of chunks.entries()) {
    const chunkScore = chunk.length / Math.max(1, output.diagnostics.length + 1);
    lines.push({
      kind: 'constraint',
      message: `${index}:${chunk.join('|')}`,
      score: chunkScore,
    });
  }

  return lines;
};
