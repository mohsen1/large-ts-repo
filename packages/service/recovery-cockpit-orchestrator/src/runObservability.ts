import { RecoveryPlan, RuntimeRun, CommandEvent } from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import { buildStrategySummary, summarizeStrategy, buildExecutionPlanEvents } from './strategy';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type RunCheckpoint = {
  readonly runId: string;
  readonly at: string;
  readonly state: RuntimeRun['state'];
  readonly activeActions: number;
  readonly completedActions: number;
};

export type RunHealth = 'healthy' | 'degraded' | 'critical';

export type RunDashboard = {
  readonly planId: string;
  readonly strategy: string;
  readonly lastCheckpoint: RunCheckpoint | undefined;
  readonly trend: ReadonlyArray<RunCheckpoint>;
  readonly health: RunHealth;
};

export const buildRunCheckpoint = (run: RuntimeRun): RunCheckpoint => ({
  runId: run.runId,
  at: toTimestamp(new Date()),
  state: run.state,
  activeActions: run.activeActionIds.length,
  completedActions: run.completedActions.length,
});

export const runHealthFromEvents = (events: readonly CommandEvent[]): RunHealth => {
  const failed = events.filter((event) => event.status === 'failed').length;
  const cancelled = events.filter((event) => event.status === 'cancelled').length;
  const total = Math.max(1, events.length);
  const failureRate = (failed + cancelled) / total;
  if (failureRate >= 0.3) return 'critical';
  if (failureRate >= 0.12) return 'degraded';
  return 'healthy';
};

export const summarizeRunHealth = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<RunDashboard> => {
  const runs = await store.listRuns(plan.planId);
  if (!runs.ok) {
    return {
      planId: plan.planId,
      strategy: 'none',
      lastCheckpoint: undefined,
      trend: [],
      health: 'critical',
    };
  }

  const trend: RunCheckpoint[] = runs.value.map((run) => buildRunCheckpoint(run));
  const last = trend.at(-1);
  const latestEvents = await store.getEvents(plan.planId, 250);

  return {
    planId: plan.planId,
    strategy: summarizeStrategy(plan, buildStrategySummary(plan)),
    lastCheckpoint: last,
    trend,
    health: runHealthFromEvents(latestEvents),
  };
};

export const annotateStrategyTimeline = (plan: RecoveryPlan): ReadonlyArray<{ step: number; actionId: string; planned: string }> => {
  const events = buildExecutionPlanEvents(buildStrategySummary(plan));
  return events.map((event, index) => ({
    step: index,
    actionId: event.actionId,
    planned: event.startedAt ?? toTimestamp(new Date()),
  }));
};

export const healthSummary = (checks: readonly RunHealth[]): {
  readonly total: number;
  readonly healthy: number;
  readonly degraded: number;
  readonly critical: number;
} => {
  const total = checks.length;
  return {
    total,
    healthy: checks.filter((status) => status === 'healthy').length,
    degraded: checks.filter((status) => status === 'degraded').length,
    critical: checks.filter((status) => status === 'critical').length,
  };
};
