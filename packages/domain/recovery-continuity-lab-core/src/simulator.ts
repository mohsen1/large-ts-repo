import {
  ContinuityAction,
  ContinuityControlContext,
  ContinuityPlan,
  ContinuitySignal,
  SimulationOutcome,
  UtcTimestamp,
} from './types';
import { evaluateConstraints, evaluateCoverage, pickViability } from './constraints';

export interface SimulatorInput {
  readonly context: ContinuityControlContext;
  readonly plan: ContinuityPlan;
  readonly signals: ReadonlyArray<ContinuitySignal>;
  readonly executedAt: UtcTimestamp;
}

export interface SimulationConfig {
  readonly baseRisk: number;
  readonly signalThreshold: number;
  readonly constraintWeight: number;
}

const BASE_RISK_MULTIPLIER = 0.18;

const scoreAction = (action: ContinuityAction, signals: ReadonlyArray<ContinuitySignal>): number => {
  const relevant = signals.filter((signal) => action.preconditions.includes(signal.kind));
  if (relevant.length === 0) {
    return 0.15;
  }
  const aggregate = relevant.reduce((sum, signal) => sum + signal.weight, 0);
  return Math.max(0.05, Math.min(1, aggregate / (relevant.length * 100)));
};

const coverageFor = (input: SimulatorInput): number => {
  const score = evaluateCoverage({ signals: input.signals, plan: input.plan }, 0.8);
  return score;
};

const baseRiskFromSignals = (signals: ReadonlyArray<ContinuitySignal>): number => {
  if (signals.length === 0) {
    return 0.2;
  }
  const average = signals.reduce((sum, signal) => sum + signal.weight, 0) / signals.length;
  return Number((average / 100).toFixed(3));
};

const actionImpact = (actions: ReadonlyArray<ContinuityAction>): number => {
  if (actions.length === 0) {
    return 0;
  }
  return actions.reduce((sum, action) => sum + action.impactScore, 0) / actions.length;
};

export const runScenarioSimulation = (input: SimulatorInput, config: SimulationConfig): SimulationOutcome => {
  const actionScore = input.plan.actions.map((action) => scoreAction(action, input.signals)).reduce((sum, score) => sum + score, 0);
  const normalizedActionScore = actionScore / Math.max(1, input.plan.actions.length);
  const baseSignalRisk = baseRiskFromSignals(input.signals);
  const provisional: Omit<SimulationOutcome, 'scenarioId'> = {
    planId: input.plan.planId,
    risk: Math.max(0, Math.min(1, baseSignalRisk + config.baseRisk * (1 + normalizedActionScore))),
    coverage: Math.max(0, Math.min(1, coverageFor(input) + 0.45 * actionImpact(input.plan.actions) / 100)),
    violations: [],
    recommendedActions: [],
    executedAt: input.executedAt,
  };
  const violations = evaluateConstraints(input.context.constraints, provisional);
  const viability = pickViability(violations);
  const risk = Math.max(0, Math.min(1, provisional.risk + (1 - viability) * config.constraintWeight + config.signalThreshold));

  return {
    scenarioId: input.plan.planId,
    planId: input.plan.planId,
    risk: Number(risk.toFixed(3)),
    coverage: Number((provisional.coverage * (0.45 + 0.45 * viability)).toFixed(3)),
    violations,
    recommendedActions: [...input.plan.actions]
      .filter((action) => action.enabled)
      .sort((left, right) => right.impactScore - left.impactScore)
      .slice(0, 3)
      .map((action) => action.title),
    executedAt: input.executedAt,
  };
};

export const runBatchSimulations = (
  input: SimulatorInput,
  configs: ReadonlyArray<SimulationConfig>,
): SimulationOutcome[] => configs.map((config) => runScenarioSimulation(input, config));

export const summarizeSimulationOutcomes = (outcomes: ReadonlyArray<SimulationOutcome>) => {
  if (outcomes.length === 0) {
    return { meanRisk: 0, maxCoverage: 0, violationCount: 0 };
  }
  const meanRisk = outcomes.reduce((acc, outcome) => acc + outcome.risk, 0) / outcomes.length;
  const maxCoverage = outcomes.reduce((acc, outcome) => acc + outcome.coverage, 0) / outcomes.length;
  const violationCount = outcomes.reduce((acc, outcome) => acc + outcome.violations.length, 0);
  return {
    meanRisk: Number(meanRisk.toFixed(3)),
    maxCoverage: Number(maxCoverage.toFixed(3)),
    violationCount,
  };
};
