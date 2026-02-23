import { Result, fail, ok } from '@shared/result';
import { toTimestamp, EntityId, computeReadiness } from '@domain/recovery-cockpit-models';
import {
  CommandEvent,
  RecoveryAction,
  RecoveryPlan,
  RuntimeRun,
} from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicy, policyGate } from './policyEngine';
import { createInMemoryWorkspace, OrchestratorConfig, OrchestrationClock, OrchestrationResult } from './ports';
import { groupByRegion, resolveExecutionOrder, sortByDuration, tagHistogram } from './planner';
import { buildReadinessProjection, buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { createEvent, createAuditRun } from '@data/recovery-cockpit-store';
import { simulatePlan } from './simulation';

const defaultConfig: OrchestratorConfig = {
  parallelism: 2,
  maxRuntimeMinutes: 180,
  retryPolicy: {
    enabled: true,
    maxRetries: 2,
  },
  policyMode: 'enforce',
};

const shuffle = <T>(values: T[]): T[] => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

export type ExecutionState = {
  run: RuntimeRun;
  remaining: RecoveryAction[];
  config: OrchestratorConfig;
  activeByRegion: Map<string, number>;
};

export class RecoveryCockpitOrchestrator {
  private state?: ExecutionState;
  private readonly config: OrchestratorConfig;

  constructor(
    private readonly workspace: ReturnType<typeof createInMemoryWorkspace>,
    private readonly scheduleClock: OrchestrationClock = workspace.clock,
    config: Partial<OrchestratorConfig> = {},
  ) {
    this.config = {
      ...defaultConfig,
      ...config,
      retryPolicy: {
        ...defaultConfig.retryPolicy,
        ...(config.retryPolicy ?? {}),
      },
    };
  }

  async start(plan: RecoveryPlan): Promise<Result<OrchestrationResult, string>> {
    const policy = evaluatePlanPolicy(plan, this.config.policyMode);
    if (!policyGate(plan, this.config.policyMode)) {
      return fail(`policy-denied:${policy.violationCount}`);
    }

    const runSeed = createAuditRun(plan.planId, {
      id: 'system:init' as EntityId,
      kind: 'operator',
    });

    const run: RuntimeRun = {
      ...runSeed,
      startedAt: toTimestamp(this.scheduleClock.now()),
    };

    const persistedRun = await this.workspace.store.upsertRun(run);
    if (!persistedRun.ok) {
      return fail(persistedRun.error);
    }

    const sortedActions = resolveExecutionOrder(plan.actions);
    const byRegion = groupByRegion(plan.actions);
    const shouldShuffle = this.config.parallelism > 1 && Object.keys(byRegion).length > 1;
    const initial = shouldShuffle ? shuffle(sortByDuration(sortedActions)) : sortByDuration(sortedActions);

    this.state = {
      run: persistedRun.value,
      remaining: initial,
      config: this.config,
      activeByRegion: new Map(),
    };

    const events: CommandEvent[] = [];
    const state = this.state;
    if (!state) return fail('orchestrator-not-initialized');

    while (state.remaining.length > 0) {
      const action = state.remaining.shift();
      if (!action) break;

      const region = action.region as string;
      const active = state.activeByRegion.get(region) ?? 0;
      if (active >= state.config.parallelism) {
        state.remaining.push(action);
        continue;
      }

      try {
        const dispatch = await this.workspace.adapter.dispatch(action);
        state.activeByRegion.set(region, active + 1);
        state.run.activeActionIds.push(action.id);
        events.push(createEvent(plan.planId, action.id, run.runId, 'queued'));

        if (!dispatch.commandId) {
          throw new Error('empty-command-id');
        }

        const updatedActive = state.activeByRegion.get(region);
        state.activeByRegion.set(region, Math.max(0, (updatedActive === undefined ? 1 : updatedActive) - 1));

        if (action.expectedDurationMinutes > state.config.maxRuntimeMinutes) {
          state.run.failedActions.push(action);
          state.run.activeActionIds = state.run.activeActionIds.filter((value) => value !== action.id);
          events.push(createEvent(plan.planId, action.id, run.runId, 'failed', 'Expected duration over limit'));
          continue;
        }

        state.run.activeActionIds = state.run.activeActionIds.filter((value) => value !== action.id);
        state.run.completedActions.push(action);
        events.push(createEvent(plan.planId, action.id, run.runId, 'completed'));
      } catch (error) {
        state.run.failedActions.push(action);
        state.run.activeActionIds = state.run.activeActionIds.filter((value) => value !== action.id);
        events.push(createEvent(plan.planId, action.id, run.runId, 'failed', (error as Error).message));
      }
    }

    state.run.state = state.run.failedActions.length > 0 ? 'failed' : 'completed';
    const persisted = await this.workspace.store.upsertRun(state.run);
    if (!persisted.ok) {
      return fail(persisted.error);
    }

    for (const event of events) {
      await this.workspace.store.publishEvent(event);
    }

    const timeline = this.forecast(plan);
    await this.workspace.store.publishEvent(
      createEvent(
        plan.planId,
        run.runId as unknown as EntityId,
        state.run.runId,
        'completed',
        `readiness=${timeline.summary}`,
      ),
    );

    return ok({ run: state.run, events });
  }

  private forecast(plan: RecoveryPlan) {
    return buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  }

  async abort(runId: string): Promise<Result<boolean, string>> {
    const run = await this.workspace.store.getRun(runId);
    if (!run.ok) return fail(run.error);
    if (!run.value) return fail('run-not-found');
    run.value.state = 'cancelled';
    const persisted = await this.workspace.store.upsertRun(run.value);
    if (!persisted.ok) return fail(persisted.error);
    return ok(true);
  }

  estimateHealth(plan: RecoveryPlan): number {
    const duration = plan.actions.reduce((acc, action) => acc + action.expectedDurationMinutes, 0);
    const histogram = Object.entries(tagHistogram(plan.actions));
    const avgDuration = duration / Math.max(plan.actions.length, 1);
    const readiness = computeReadiness(100, duration);
    const penalty = histogram.length * 1.2 + (plan.isSafe ? 0 : 10);
    const policy = evaluatePlanPolicy(plan, 'advisory').riskScore;
    return Number(Math.max(0, Math.min(100, readiness - avgDuration - penalty - policy)).toFixed(2));
  }

  simulate(plan: RecoveryPlan) {
    const summary = simulatePlan(plan);
    const readiness = buildReadinessProjection(plan, 'automated');
    return {
      ...summary,
      readiness,
    };
  }
}
