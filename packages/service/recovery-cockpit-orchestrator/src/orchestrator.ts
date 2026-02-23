import { Result, fail, ok } from '@shared/result';
import { toTimestamp, EntityId } from '@domain/recovery-cockpit-models';
import {
  computeReadiness,
  CommandEvent,
  RecoveryAction,
  RecoveryPlan,
  RuntimeRun,
} from '@domain/recovery-cockpit-models';
import { createEvent, createAuditRun } from '@data/recovery-cockpit-store';
import { createInMemoryWorkspace, OrchestratorConfig, OrchestrationClock, OrchestrationResult } from './ports';
import { groupByRegion, sortByDuration, resolveExecutionOrder } from './planner';

const defaultConfig: OrchestratorConfig = {
  parallelism: 2,
  maxRuntimeMinutes: 180,
  retryPolicy: {
    enabled: true,
    maxRetries: 2,
  },
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

  private createEvents(run: RuntimeRun, action: RecoveryAction, status: CommandEvent['status'], reason?: string): CommandEvent {
    return createEvent(run.planId, action.id, run.runId, status, reason);
  }

  async start(plan: RecoveryPlan): Promise<Result<OrchestrationResult, string>> {
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

    return this.dripExecute();
  }

  private async dripExecute(): Promise<Result<OrchestrationResult, string>> {
    const state = this.state;
    if (!state) return fail('orchestrator not initialized');

    const events: CommandEvent[] = [];
    const { remaining, run } = state;

    while (remaining.length > 0) {
      const action = remaining.shift();
      if (!action) break;

      const region = action.region as string;
      const active = state.activeByRegion.get(region) ?? 0;
      if (active >= state.config.parallelism) {
        remaining.push(action);
        continue;
      }

      try {
        const dispatch = await this.workspace.adapter.dispatch(action);
        state.activeByRegion.set(region, active + 1);
        run.activeActionIds.push(action.id);
        events.push(this.createEvents(run, action, 'queued'));

        if (!dispatch.commandId) {
          throw new Error('empty-command-id');
        }

        state.activeByRegion.set(region, Math.max(0, (state.activeByRegion.get(region) ?? 1) - 1));

        if (action.expectedDurationMinutes > state.config.maxRuntimeMinutes) {
          run.failedActions.push(action);
          run.activeActionIds = run.activeActionIds.filter((value) => value !== action.id);
          events.push(this.createEvents(run, action, 'failed', 'Expected duration over limit'));
          continue;
        }

        run.activeActionIds = run.activeActionIds.filter((value) => value !== action.id);
        run.completedActions.push(action);
        events.push(this.createEvents(run, action, 'completed'));
      } catch (error) {
        run.failedActions.push(action);
        run.activeActionIds = run.activeActionIds.filter((value) => value !== action.id);
        events.push(this.createEvents(run, action, 'failed', (error as Error).message));
      }
    }

    run.state = run.failedActions.length > 0 ? 'failed' : 'completed';
    const persisted = await this.workspace.store.upsertRun(run);
    if (!persisted.ok) {
      return fail(persisted.error);
    }

    for (const event of events) {
      await this.workspace.store.publishEvent(event);
    }

    return ok({ run, events });
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
    const actionScore = plan.actions.reduce((acc, action) => {
      if (action.retriesAllowed === 0) return acc + 2;
      return acc + action.tags.length + action.expectedDurationMinutes / 10;
    }, 0);

    const readinessScore = computeReadiness(100, plan.actions.length);
    const safetyModifier = plan.isSafe ? 1 : 0.65;
    const normalized = (readinessScore - actionScore) * safetyModifier;
    return Number(Math.max(0, Math.min(100, normalized)).toFixed(2));
  }
}
