import type { Brand, JsonValue } from '@shared/type-level';
import type {
  AutomationPlanTemplate,
  StageDefinition,
  StageExecution,
} from '@shared/automation-orchestration-runtime';
import type { AutomationRun, AutomationSummary, AutomationStatus, AutomationScore } from './types';

export type RiskSignal<TValue extends number = number> = Brand<TValue, 'RiskSignal'>;
export type RunId = Brand<string, 'OrchestrationRunId'>;

export interface RiskDimension {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly rationale: string[];
}

export interface RiskProfile {
  readonly runId: RunId;
  readonly score: number;
  readonly dimensions: readonly RiskDimension[];
  readonly flagged: readonly string[];
}

const normalize = (value: number): number => Math.max(0, Math.min(value, 100));

export const computeRiskSignal = (value: number): RiskSignal<number> => {
  const safe = Number.isFinite(value) ? normalize(Math.round(value * 100)) : 0;
  return safe as RiskSignal<number>;
}

export const computeRiskProfile = (run: AutomationRun, dimensions: readonly RiskDimension[]): RiskProfile => {
  const totalWeight = dimensions.reduce((accumulator, dimension) => accumulator + Math.max(dimension.weight, 0), 0);
  const normalizedWeight = totalWeight === 0 ? 1 : totalWeight;
  const risk = dimensions.reduce((accumulator, dimension) => {
    const signal = dimension.score * (dimension.weight / normalizedWeight);
    return accumulator + signal;
  }, 0);
  return {
    runId: run.id as RunId,
    score: normalize(risk),
    dimensions,
    flagged: dimensions.filter((dimension) => dimension.score > 70).map((dimension) => dimension.name),
  };
};

export const computeSummary = (
  run: AutomationRun,
  plans: readonly AutomationPlanTemplate[],
  executions: readonly StageExecution<unknown, unknown>[],
): AutomationSummary => {
  const failedCount = executions.filter((execution) => execution.status === 'error').length;
  const risk = computeRiskProfile(run, [
    {
      name: 'execution',
      score: Math.max(0, 100 - failedCount * 10),
      weight: 0.45,
      rationale: [`${failedCount} failed stages`],
    },
    {
      name: 'plan-width',
      score: Math.max(0, 100 - plans.length * 5),
      weight: 0.25,
      rationale: [`${plans.length} plan stages`],
    },
    {
      name: 'age',
      score: 100,
      weight: 0.3,
      rationale: ['steady state'],
    },
  ]);

  const successRate = Math.max(0, 100 - failedCount * 25);
  return {
    run,
    commandCount: plans.reduce((sum, plan) => sum + plan.stages.length, 0),
    failedStageCount: failedCount,
    riskScore: risk.score,
  };
};

export type StatusSeries = readonly { readonly at: string; readonly status: AutomationStatus; readonly stage: string }[];

export const projectStatusSeries = (run: AutomationRun): StatusSeries =>
  run.events.map((event, index) => ({
    at: `${run.startedAt}-${index}`,
    status: run.status,
    stage: event,
  }));

export const toScore = (risk: RiskProfile): AutomationScore => {
  return (Math.round(risk.score) as number) as AutomationScore;
};

export type RiskContext = {
  readonly risk: number;
  readonly trend: 'rising' | 'steady' | 'falling';
  readonly signals: readonly {
    readonly name: string;
    readonly signal: RiskSignal;
  }[];
};

export const aggregateSignals = (dimensionSignals: readonly [RiskDimension, ...RiskDimension[]]): RiskContext => {
  const total = dimensionSignals.reduce((accumulator, dimension) => accumulator + dimension.weight * dimension.score, 0);
  const trend = total > 55 ? 'rising' : total > 35 ? 'steady' : 'falling';
  return {
    risk: normalize(total),
    trend,
    signals: dimensionSignals.map((dimension) => ({
      name: dimension.name,
      signal: computeRiskSignal(dimension.score),
    })),
  };
};

export const flattenJsonValue = (value: JsonValue): readonly string[] => {
  if (value == null) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonValue);
  }
  return Object.entries(value).flatMap(([key, nested]) => [key, ...flattenJsonValue(nested)]);
};
