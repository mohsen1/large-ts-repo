import type {
  SurfaceRun,
  SimulationContext,
  CommandSurfacePlanId,
  CommandSurfaceRunId,
} from '@domain/recovery-command-surface-models';
import { forecastReadiness, evaluateRuleMatches } from '@domain/recovery-command-surface-models/policies';
import { simulateExecution } from '@domain/recovery-command-surface-models/planner';
import type { SurfacePolicy } from '@domain/recovery-command-surface-models';

export interface ForecastWindow {
  readonly planId: CommandSurfacePlanId;
  readonly runId: CommandSurfaceRunId;
  readonly recommendation: string;
  readonly predictedRisk: number;
}

export interface ForecastBatch {
  readonly batchIndex: number;
  readonly riskScore: number;
  readonly readyCommands: readonly string[];
}

const parsePolicyState = (policy: SurfacePolicy): boolean => policy.enabled && policy.rules.length > 0;

export const buildForecastWindow = (
  run: SurfaceRun,
  planId: CommandSurfacePlanId,
  policy: SurfacePolicy,
): ForecastWindow => {
  const context: SimulationContext = {
    run,
    currentTimestamp: new Date().toISOString(),
    globalBudgetMinutes: 240,
  };
  const simulation = simulateExecution(run, context);
  const ruleMatches = evaluateRuleMatches(
    {
      id: planId,
      name: 'ad-hoc',
      surface: { tenant: run.tenant, region: 'unknown', zone: 'unknown', accountId: 'unknown' },
      createdAt: context.currentTimestamp,
      updatedAt: context.currentTimestamp,
      commands: [],
      dependencies: [],
      constraints: {
        maxInFlight: 1,
        maxRisk: 1,
        allowedDowntimeMinutes: 1,
      },
    },
    run,
    policy.rules,
  );
  const averageMatch = ruleMatches.reduce<number>((sum, match) => sum + (match.maxValue === 0 ? 0 : match.value / match.maxValue), 0);
  const score = Math.max(0, Math.min(100, averageMatch * 100));
  const policyState = parsePolicyState(policy) ? 'policy-compliant' : 'policy-missing';
  return {
    planId,
    runId: run.id,
    recommendation: `forecast confidence ${simulation.projectedSteps.length}; ${policyState}; match-score ${score.toFixed(1)}`,
    predictedRisk: run.riskScore + simulation.predictedRisk + score,
  };
};

export const bucketForecast = (run: SurfaceRun): readonly ForecastBatch[] => {
  const signals = run.signals.map((signal) => signal.value);
  const average = signals.length === 0 ? 0 : signals.reduce((sum, value) => sum + value, 0) / signals.length;
  const riskBuckets = Math.max(1, Math.ceil((run.riskScore || 1) / 25));
  const batches: ForecastBatch[] = [];
  for (let index = 0; index < riskBuckets; index += 1) {
    const start = index * average;
    const end = start + average;
    const selected = run.signals
      .filter((signal) => signal.value >= start && signal.value < end)
      .map((signal) => signal.key);
    batches.push({
      batchIndex: index,
      riskScore: Math.floor(average + index * 5),
      readyCommands: selected,
    });
  }
  return batches;
};
