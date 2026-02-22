import { createEnvelope } from '@shared/protocol';
import { MessageBus } from '@platform/messaging';
import {
  RunResult,
  PlanSnapshot,
  evaluateWithPolicy,
  validateSnapshot,
  buildSchedule,
  StageGraph,
  StageWindow,
} from '@domain/failover-orchestration';
import { InMemoryFailoverPlanStore, SnapshotStorePort, SnapshotStoreError, decodeSnapshotPayload } from '@data/failover-plans';
import { ok, fail, Result } from '@shared/result';
import { withRetry } from '@shared/util';
import { TopicName } from '@platform/messaging';
import { FailoverCommand, ExecutePlanPayload, UpsertPlanPayload, StageControlPayload } from './commands';
import { SnapshotArchivePort } from './adapters/snapshot-adapter';

interface RuntimeDependencies {
  bus: MessageBus;
  store: SnapshotStorePort;
  archive: SnapshotArchivePort;
}

interface RuntimeState {
  running: Set<string>;
  completed: Set<string>;
  failed: Set<string>;
}

export interface FailoverRuntime {
  handle(command: FailoverCommand): Promise<Result<void, SnapshotStoreError>>;
  state(): RuntimeState;
}

interface StageRow {
  stageId: string;
  startsAt: string;
}

const serialize = (snapshot: PlanSnapshot): string => JSON.stringify(snapshot);

const deserialize = (value: string): PlanSnapshot => {
  const parsed = decodeSnapshotPayload(value);
  if (parsed.ok) return parsed.value;
  throw new Error('invalid snapshot payload');
};

export const runScheduleStage = async (planId: string, stage: StageRow, graph: StageGraph[]): Promise<RunResult> => {
  const startedAt = new Date().toISOString();
  const now = Date.parse(stage.startsAt);
  const completedAt = new Date(now + 60_000).toISOString();

  return {
    planId: planId as any,
    stage: stage.stageId as any,
    completedAt,
    success: now <= Date.parse(completedAt),
    details: `Executed ${stage.stageId} at ${startedAt} using ${graph.length} graph nodes`,
    metrics: {
      'error-rate': 0,
      'lag-ms': startedAt === completedAt ? 0 : 1,
    },
  };
};

export const createRuntime = ({ bus, store, archive }: RuntimeDependencies): FailoverRuntime => {
  const state: RuntimeState = {
    running: new Set<string>(),
    completed: new Set<string>(),
    failed: new Set<string>(),
  };

  const executePlan = async (payload: ExecutePlanPayload): Promise<void> => {
    const stored = await store.get(payload.planId);
    if (!stored.ok || !stored.value) {
      throw new Error(`plan unavailable: ${payload.planId}`);
    }

    const snapshot = deserialize(stored.value.snapshot);
    const policy = evaluateWithPolicy(snapshot);
    if (!policy.accepted) {
      throw new Error(`plan rejected by policy ${payload.planId}: ${policy.violations.map((it) => it.code).join(',')}`);
    }

    const constraintResult = validateSnapshot(snapshot, {
      activeApprovals: [],
      maxRegionCapacity: 100,
      minimumApprovals: 2,
      slaBufferMinutes: 20,
    });
    if (!constraintResult.valid) {
      throw new Error(`plan constraint check failed: ${constraintResult.errors.map((it) => it.code).join(',')}`);
    }

    const schedule = buildSchedule(snapshot, snapshot.graph as [StageGraph, ...StageGraph[]], { jitterMinutes: 1 });
    state.running.add(payload.planId);

    for (const stage of schedule.stages) {
      await withRetry(() => runScheduleStage(payload.planId, stage, snapshot.graph as StageGraph[]), {
        times: 3,
        delayMs: 60,
        factor: 2,
      });

      await bus.publish(
        'failover-runtime.stage.completed' as TopicName,
        createEnvelope('failover-runtime.stage.completed', {
          planId: payload.planId,
          stageId: stage.stageId,
          startedAt: stage.startsAt,
          planState: snapshot.plan.state,
        }),
      );
    }

      await bus.publish(
        'failover-runtime.plan.executed' as TopicName,
        createEnvelope('failover-runtime.plan.executed', {
        planId: payload.planId,
        executedAt: new Date().toISOString(),
        stages: schedule.stages.length,
        requestedBy: payload.initiatedBy,
      }),
    );

    await archive.archive(payload.planId, serialize(snapshot));
    state.running.delete(payload.planId);
    state.completed.add(payload.planId);
  };

  const handle = async (command: FailoverCommand): Promise<Result<void, SnapshotStoreError>> => {
    try {
      if (command.command === 'failover-runtime.plan.upsert') {
        const payload = command.payload as UpsertPlanPayload;
        const created = await store.save(payload.planId, payload.planJson);
        if (!created.ok) {
          return created;
        }
        return ok(undefined);
      }

      if (command.command === 'failover-runtime.plan.execute') {
        await executePlan(command.payload as ExecutePlanPayload);
        return ok(undefined);
      }

      if (command.command === 'failover-runtime.stage.start') {
        const payload = command.payload as StageControlPayload;
        state.running.add(payload.planId);
        return ok(undefined);
      }

      if (command.command === 'failover-runtime.stage.complete') {
        const payload = command.payload as StageControlPayload;
        state.running.delete(payload.planId);
        state.completed.add(payload.planId);
        return ok(undefined);
      }

      return ok(undefined);
    } catch (error) {
      state.failed.add(command.payload.planId as string);
      return fail({
        kind: 'io-error',
        message: (error as Error).message,
      });
    }
  };

  return {
    handle,
    state: () => ({
      running: new Set(Array.from(state.running)),
      completed: new Set(Array.from(state.completed)),
      failed: new Set(Array.from(state.failed)),
    }),
  };
};

export const runFromCommand = async (runtime: FailoverRuntime, command: FailoverCommand): Promise<void> => {
  const result = await runtime.handle(command);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
};

export const createDefaultRuntime = (bus: MessageBus): FailoverRuntime => {
  const store = new InMemoryFailoverPlanStore();
  const archive: SnapshotArchivePort = {
    async archive() {
      return ok('local://noop');
    },
    async load() {
      return ok(undefined);
    },
  };
  return createRuntime({ bus, store, archive });
};
