import { RecoveryPlan, RecoveryAction, RuntimeRun, CommandEvent } from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import { buildTopologySnapshot } from '@domain/recovery-cockpit-workloads';
import { runPlannerPipeline, resolveExecutionOrder, summarizePlan } from './planner';
import { OrchestratorConfig } from './ports';
import { evaluatePlanPolicy } from './policyEngine';

export type ExecutionStrategy = 'fastest-first' | 'critical-first' | 'dependency-first' | 'balanced';

export type StrategyPlan = {
  readonly plan: RecoveryPlan;
  readonly stages: readonly ExecutionStage[];
  readonly estimatedMinutes: number;
  readonly strategy: ExecutionStrategy;
  readonly policyRisk: number;
};

export type ExecutionStage = {
  readonly index: number;
  readonly actionIds: readonly string[];
  readonly expectedMinutes: number;
  readonly concurrency: number;
  readonly tags: readonly string[];
};

type MutableActionState = {
  readonly actionId: string;
  status: CommandEvent['status'];
  reason?: string;
  startedAt?: string;
  finishedAt?: string;
};

const stageConcurrency = (actions: readonly RecoveryAction[]): number => {
  const tags = new Set(actions.flatMap((action) => action.tags));
  return Math.max(1, Math.min(4, tags.size));
};

const toMinutes = (run: RuntimeRun): number => {
  const now = Date.now();
  return Number((now - new Date(run.startedAt).getTime()) / 60000);
};

export const buildExecutionStrategy = (
  plan: RecoveryPlan,
  strategy: ExecutionStrategy = 'balanced',
): StrategyPlan => {
  const sorted = (() => {
    if (strategy === 'dependency-first') {
      return resolveExecutionOrder(plan.actions);
    }
    if (strategy === 'critical-first') {
      return [...plan.actions].sort((left, right) => {
        const leftScore = left.expectedDurationMinutes + left.dependencies.length * 7;
        const rightScore = right.expectedDurationMinutes + right.dependencies.length * 7;
        return leftScore - rightScore;
      });
    }
    if (strategy === 'fastest-first') {
      return [...plan.actions].sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes);
    }
    return [...plan.actions].sort((left, right) => right.tags.length - left.tags.length);
  })();

  const pipeline = runPlannerPipeline(plan, [
    (nextPlan) => ({ ...nextPlan, actions: sorted }),
  ]);
  const stages = buildStages(pipeline.actions);
  const estimatedMinutes = stages.reduce((acc, stage) => acc + stage.expectedMinutes, 0);
  const policyRisk = evaluatePlanPolicy(plan, 'advisory').riskScore;

  return {
    plan: pipeline,
    stages,
    estimatedMinutes,
    strategy,
    policyRisk,
  };
};

export const buildStrategySummary = (plan: RecoveryPlan): StrategyPlan => buildExecutionStrategy(plan, 'balanced');

const buildStages = (actions: readonly RecoveryAction[]): ExecutionStage[] => {
  const grouped = new Map<number, RecoveryAction[]>();
  const snapshot = buildTopologySnapshot({
    planId: 'tmp' as any,
    labels: { short: '', long: '', emoji: '', labels: [] },
    version: 1 as any,
    mode: 'automated',
    title: '',
    description: '',
    actions,
    audit: [],
    slaMinutes: 0,
    isSafe: true,
    effectiveAt: toTimestamp(new Date()),
  });

  for (const action of actions) {
    const key = (snapshot.edges.filter((edge) => edge.to === action.id).length || 0) + action.dependencies.length;
    const bucket = grouped.get(key) ?? [];
    bucket.push(action);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([index, bucket]) => ({
      index,
      actionIds: bucket.map((action) => action.id),
      expectedMinutes: bucket.reduce((acc, action) => Math.max(acc, action.expectedDurationMinutes), 0),
      concurrency: stageConcurrency(bucket),
      tags: [...new Set(bucket.flatMap((action) => action.tags))],
    }));
};

export const summarizeStrategy = (plan: RecoveryPlan, strategy: StrategyPlan): string =>
  `${summarizePlan(plan).plan.planId} strategy=${strategy.strategy} stages=${strategy.stages.length} estimate=${strategy.estimatedMinutes}`;

export const estimateRecoveryDuration = (run: RuntimeRun): number => {
  return toMinutes(run) + run.failedActions.length + run.completedActions.length;
};

export const buildExecutionPlanEvents = (strategy: StrategyPlan): readonly MutableActionState[] => {
  const states: MutableActionState[] = [];
  for (const stage of strategy.stages) {
    for (const actionId of stage.actionIds) {
      const now = toTimestamp(new Date());
      states.push({ actionId, status: 'queued', startedAt: now, finishedAt: undefined });
    }
  }
  return states;
};

export const chooseStrategyForConfig = (config: OrchestratorConfig): ExecutionStrategy => {
  if (config.maxRuntimeMinutes <= 90) {
    return 'fastest-first';
  }
  if (config.parallelism <= 1) {
    return 'dependency-first';
  }
  if (config.policyMode === 'enforce') {
    return 'critical-first';
  }
  return 'balanced';
};
