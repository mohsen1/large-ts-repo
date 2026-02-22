import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { foldSnapshotProjection } from './metrics';
import type { SimulationPlanEnvelope, SimulationWorkspaceSnapshot } from './types';

const MAX_STEPS = 100;

export interface WorkspaceRuntimeState {
  readonly commandIssuedAt: string;
  readonly plan: SimulationPlanEnvelope;
  readonly executedWaves: number;
  readonly stoppedAt?: string;
  readonly eventLog: readonly string[];
}

const readSnapshot = (
  state: WorkspaceRuntimeState,
): SimulationWorkspaceSnapshot => {
  const snapshot = foldSnapshotProjection(state.plan.plan.waves, state.executedWaves);
  return {
    ...snapshot,
    runId: state.plan.plan.runId,
    projectedSignalCoverage: Math.min(1, state.executedWaves / Math.max(1, state.plan.plan.waves.length)),
  };
};

export class SimulationWorkspace {
  private readonly state = new Map<string, WorkspaceRuntimeState>();

  constructor(private readonly planEnvelope: SimulationPlanEnvelope) {}

  start(runId: string): Result<SimulationWorkspaceSnapshot, Error> {
    if (this.state.has(runId)) {
      return fail(new Error(`run-exists:${runId}`));
    }

    this.state.set(runId, {
      commandIssuedAt: new Date().toISOString(),
      plan: this.planEnvelope,
      executedWaves: 0,
      eventLog: ['start'],
    });

    const started = this.state.get(runId);
    if (!started) {
      return fail(new Error('start-failed'));
    }

    return ok(readSnapshot(started));
  }

  tick(runId: string): Result<SimulationWorkspaceSnapshot, Error> {
    const current = this.state.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    if (current.executedWaves >= current.plan.plan.waves.length) {
      return ok({
        ...readSnapshot(current),
        status: 'complete',
        completedSignals: current.plan.plan.summary.signalCoverage,
      });
    }

    const nextState: WorkspaceRuntimeState = {
      ...current,
      executedWaves: Math.min(current.executedWaves + 1, current.plan.plan.waves.length),
      eventLog: [...current.eventLog, `tick:${current.executedWaves + 1}`],
      stoppedAt: current.executedWaves + 1 >= current.plan.plan.waves.length ? new Date().toISOString() : undefined,
    };

    this.state.set(runId, nextState);
    return ok(readSnapshot(nextState));
  }

  snapshot(runId: string): Result<SimulationWorkspaceSnapshot, Error> {
    const current = this.state.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }
    return ok(readSnapshot(current));
  }

  cancel(runId: string): Result<SimulationWorkspaceSnapshot, Error> {
    const current = this.state.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    const updated: WorkspaceRuntimeState = {
      ...current,
      executedWaves: Math.min(current.executedWaves, MAX_STEPS),
      stoppedAt: new Date().toISOString(),
      eventLog: [...current.eventLog, 'cancel'],
    };
    this.state.set(runId, updated);
    return ok(readSnapshot(updated));
  }

  journal(runId: string): Result<readonly string[], Error> {
    const current = this.state.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }
    return ok(current.eventLog);
  }
}
