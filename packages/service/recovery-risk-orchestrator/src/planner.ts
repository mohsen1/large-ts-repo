import type {
  RiskBudget,
  RiskConstraint,
  RiskSignalWeight,
  RiskScenario,
  ScenarioSignal,
  StrategyCommandInput,
  StrategyExecutionResult,
  StrategyProfile,
  StrategySignal,
  StrategySignalPack,
  StrategyExecutionLog,
  RiskStrategyId,
  RiskWindowId,
} from '@domain/recovery-risk-strategy';
import {
  buildExecutionResult,
  buildSignalPack,
  classifySeverity,
  logStateTransition,
  weightedAverage,
} from '@domain/recovery-risk-strategy';
import { buildTimelineWindow, toAuditLogs, summarizeTimeline, buildSummary } from '@domain/recovery-risk-strategy/src/timeline';
import { deriveSeverityFromPack, gateInputFromCommand, summarizeConstraints } from '@domain/recovery-risk-strategy/src/policy-gates';
import type { StrategyPlan } from '@domain/recovery-risk-strategy/src/types';

export interface RiskPlan {
  readonly profile: StrategyProfile;
  readonly scenario: RiskScenario;
  readonly pack: StrategySignalPack;
  readonly weights: readonly RiskSignalWeight[];
  readonly command: StrategyCommandInput;
}

export interface PlannedRun {
  readonly summary: string;
  readonly runId: RiskWindowId;
  readonly score: number;
  readonly severity: ReturnType<typeof deriveSeverityFromPack>;
}

const buildSignals = (signals: readonly ScenarioSignal[]): readonly StrategySignal[] =>
  signals.map((signal) => ({
    dimension: signal.signalName,
    score: signal.score,
    weight: 1,
    confidence: signal.confidence,
  }));

const constraintSeed = (constraints: readonly RiskConstraint[]): string =>
  constraints
    .map((constraint) => `${constraint.dimension}:${constraint.minimum}-${constraint.maximum}`)
    .join(',');

const budgetSeed = (budgets: readonly RiskBudget[]): string =>
  budgets.map((budget) => `${budget.name}:${budget.hardCap}`).join(',');

export const planRiskStrategy = (input: StrategyCommandInput): RiskPlan => {
  const pack = buildSignalPack(
    input.scenario.scenarioId,
    input.signals,
    input.constraints,
    input.budgets,
    input.strategy.weights,
  );

  return {
    profile: input.strategy,
    scenario: input.scenario,
    pack,
    weights: input.strategy.weights,
    command: input,
  };
};

export const executePlan = (plan: RiskPlan, asn: string): PlannedRun => {
  const score = weightedAverage(plan.pack.vectors);
  const runId = `${plan.profile.profileId}:run:${asn}` as RiskWindowId;
  const log: readonly StrategyExecutionLog[] = [
    logStateTransition(runId, 'queued', 'plan created'),
    logStateTransition(runId, 'ready', 'signals enriched'),
    logStateTransition(runId, 'scored', `score=${score.toFixed(2)}`),
  ];

  const result: StrategyExecutionResult = buildExecutionResult(
    runId,
    plan.profile,
    plan.pack,
    score,
    plan.profile.profileId,
    `${runId}:seed` as any,
    log,
  );

  const timeline = buildTimelineWindow(
    runId,
    plan.pack,
    result,
    [
      ['red', 0],
      ['yellow', 0],
      ['green', result.vector.vectors.length],
      ['black', score >= 90 ? 1 : 0],
    ] as const,
  );

  const decision = gateInputFromCommand(plan.command);
  const summary = [
    `runId=${runId}`,
    `scenario=${plan.scenario.scenarioId}`,
    `constraints=${constraintSeed(plan.command.constraints)}`,
    `budgets=${budgetSeed(plan.command.budgets)}`,
    `score=${score}`,
    `severity=${classifySeverity(score)}`,
    `decision=${decision.allowed}`,
    `timeline=${timeline.ticks.length}`,
    `audit=${toAuditLogs(timeline.ticks).length}`,
    `summary=${buildSummary(result).recommendationCount}`,
    `signals=${buildSignals(plan.command.signals).length}`,
  ].join('|');

  return {
    summary,
    runId,
    score,
    severity: deriveSeverityFromPack(plan.pack),
  };
};

export const describePlan = (plan: RiskPlan): string => {
  const decision = gateInputFromCommand(plan.command);
  const constraints = summarizeConstraints(plan.command.constraints);
  return [
    `profile=${plan.profile.profileId}`,
    `scenario=${plan.scenario.scenarioId}`,
    `decision=${decision.allowed}`,
    `constraints=${constraints}`,
    `weights=${plan.weights.length}`,
  ].join(';');
};

export const enrichPlan = (plan: RiskPlan): StrategyPlan => ({
  strategy: plan.profile,
  scenario: plan.scenario,
  resource: `${plan.profile.owner}` as StrategyPlan['resource'],
  actor: `${plan.profile.owner}:actor` as StrategyPlan['actor'],
  signals: plan.command.signals,
  requiredRunId: `${plan.profile.profileId}:required:${plan.scenario.scenarioId}` as StrategyPlan['requiredRunId'],
  maxBudgetPerClass: {
    compute: 100,
    storage: 100,
    network: 100,
    identity: 100,
    data: 100,
  },
  notes: ['generated'],
  dryRun: false,
});
