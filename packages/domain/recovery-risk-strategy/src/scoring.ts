import { z } from 'zod';

import type {
  ConfidenceBand,
  RiskBudget,
  RiskConstraint,
  RiskScenarioId,
  ScenarioSignal,
  SeverityBand,
  StrategyExecutionResult,
  StrategyExecutionLog,
  StrategyExecutionState,
  StrategyProfile,
  StrategySignal,
  StrategySignalPack,
  RiskStrategyId,
  RiskSignalId,
  RiskSignalWeight,
  RiskWindowId,
} from './types';

const confidenceScale: Record<ConfidenceBand, number> = {
  low: 0.55,
  medium: 0.8,
  high: 1,
};

export const scenarioSignalSchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().uuid(),
  signalName: z.string().min(1),
  score: z.number().min(0).max(100),
  observedAt: z.string().datetime(),
  confidence: z.enum(['low', 'medium', 'high']),
  metadata: z.record(z.string()),
});

export const strategyCommandSchema = z.object({
  strategyId: z.string().min(1),
  scenarioId: z.string().uuid(),
  vectorCount: z.number().min(0),
  generatedAt: z.string().datetime(),
});

export const clampDimensionScore = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};

export const toSignal = (
  signal: ScenarioSignal,
  weights: readonly RiskSignalWeight[],
): StrategySignal => {
  const weight = weights.find((entry) => entry.dimension === signal.signalName)?.weight ?? 1;
  const cappedScore = clampDimensionScore(signal.score);
  return {
    dimension: signal.signalName,
    score: Number((cappedScore * weight).toFixed(2)),
    weight,
    confidence: signal.confidence,
  };
};

const confidencePenalty = (confidence: ConfidenceBand, sample: number): number => sample * (1 - confidenceScale[confidence] * 0.15);

export const toRiskVectors = (signals: readonly ScenarioSignal[], weights: readonly RiskSignalWeight[]): readonly StrategySignal[] =>
  signals.map((signal) => {
    const vector = toSignal(signal, weights);
    return {
      ...vector,
      score: vector.score,
      weight: vector.weight,
    };
  });

export const weightedAverage = (vectors: readonly StrategySignal[]): number => {
  const totals = vectors.reduce(
    (
      acc,
      vector,
    ) => {
      const corrected = confidencePenalty(vector.confidence, vector.score);
      return {
        weightedSum: acc.weightedSum + corrected * vector.weight,
        weightSum: acc.weightSum + vector.weight,
      };
    },
    { weightedSum: 0, weightSum: 0 },
  );

  if (totals.weightSum === 0) {
    return 0;
  }

  return Number(Math.max(0, Math.min(100, totals.weightedSum / totals.weightSum)).toFixed(2));
};

export const classifySeverity = (score: number): SeverityBand => {
  if (score >= 85) {
    return 'black';
  }
  if (score >= 70) {
    return 'red';
  }
  if (score >= 45) {
    return 'yellow';
  }
  return 'green';
};

export const logStateTransition = (runId: RiskWindowId, state: StrategyExecutionState, note: string): StrategyExecutionLog => ({
  runId,
  state,
  timestamp: new Date().toISOString(),
  note,
});

const clampBudgetUtilization = (budget: RiskBudget, utilization: number): number => {
  if (budget.hardCap <= 0) {
    return 100;
  }

  return clampDimensionScore((utilization / budget.hardCap) * 100);
};

const findByDimension = (vectors: readonly StrategySignal[], dimension: string): StrategySignal | undefined =>
  vectors.find((vector) => vector.dimension === dimension);

export const buildSignalPack = (
  scenarioId: RiskScenarioId,
  signals: readonly ScenarioSignal[],
  constraints: readonly RiskConstraint[],
  budgets: readonly RiskBudget[],
  weights: readonly RiskSignalWeight[],
): StrategySignalPack => {
  const vectors = toRiskVectors(signals, weights);

  const adjusted = vectors.map((vector) => {
    const relevantBudget = budgets.find((budget) => budget.resourceClass === 'compute');
    if (!relevantBudget) {
      return vector;
    }

    const utilization = vector.score * (1 + vector.weight * 0.1);
    return {
      ...vector,
      score: clampDimensionScore(vector.score * (100 - clampBudgetUtilization(relevantBudget, utilization)) / 100),
    };
  });

  return {
    scenarioId,
    vectors: adjusted,
    constraints,
    budgets,
    generatedAt: new Date().toISOString(),
  };
};

export const buildExecutionResult = (
  runId: RiskWindowId,
  profile: StrategyProfile,
  pack: StrategySignalPack,
  score: number,
  strategyId: RiskStrategyId,
  signalId: RiskSignalId,
  logs: readonly StrategyExecutionLog[],
): StrategyExecutionResult => {
  const severityBand = classifySeverity(score);

  return {
    run: {
      runId,
      strategyId,
      scenarioId: pack.scenarioId,
      resource: `${strategyId}:resource` as StrategyExecutionResult['run']['resource'],
      actor: `${strategyId}:actor` as StrategyExecutionResult['run']['actor'],
      direction: profile.scenarios.length > 2 ? 'adaptive' : 'defensive',
      budgets: pack.budgets,
      constraints: pack.constraints,
      startedAt: new Date().toISOString(),
      score,
      metadata: {
        command: 'execute',
        severity: severityBand,
        recommendation: `${pack.vectors.length} vectors processed from signal ${signalId}`,
      },
    },
    vector: pack,
    severityBand,
    recommendation: `${severityBand} risk with ${pack.vectors.length} active vectors`,
    logs,
  };
};
