import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  buildPlan,
  SimulationWorkspace,
  buildGraphFromDraft,
  type SimulationConstraint,
  defaultConstraint,
  type SimulationCommand,
  type SimulationPlanEnvelope,
  type SimulationWorkspaceSnapshot,
} from '@domain/recovery-readiness-simulation';
import {
  type ReadinessPolicy,
  type RecoveryReadinessPlanDraft,
  type ReadinessSignal,
  type ReadinessRunId,
} from '@domain/recovery-readiness';
import { InMemorySimulationRunStore, runIdFromCommand } from './readiness-simulation-runs';

export interface ReadinessSimulationRuntime {
  readonly runId: string;
  readonly snapshot: () => SimulationWorkspaceSnapshot | undefined;
  readonly step: () => Result<SimulationWorkspaceSnapshot, Error>;
}

export interface ReadinessSimulationFacade {
  start: (runId: ReadinessRunId, draft: RecoveryReadinessPlanDraft, policy: ReadinessPolicy, signals: readonly ReadinessSignal[]) => Promise<Result<ReadinessSimulationRuntime, Error>>;
  status: (runId: ReadinessRunId) => Promise<Result<SimulationWorkspaceSnapshot, Error>>;
  step: (runId: ReadinessRunId) => Promise<Result<SimulationWorkspaceSnapshot, Error>>;
}

const evaluateCommand = (runId: ReadinessRunId, draft: RecoveryReadinessPlanDraft): SimulationCommand => ({
  tenant: draft.owner,
  runId,
  seed: draft.targetIds.length,
  targetIds: draft.targetIds,
});

export class RecoveryReadinessSimulationFacade implements ReadinessSimulationFacade {
  private readonly runtimes = new Map<string, SimulationWorkspace>();
  private readonly registry = new InMemorySimulationRunStore();

  async start(
    runId: ReadinessRunId,
    draft: RecoveryReadinessPlanDraft,
    policy: ReadinessPolicy,
    signals: readonly ReadinessSignal[],
  ): Promise<Result<ReadinessSimulationRuntime, Error>> {
    const command = evaluateCommand(runId, draft);
    const graph = buildGraphFromDraft({ draft: { targetIds: draft.targetIds } });
    const constraints: SimulationConstraint = defaultConstraint(draft.targetIds.length);
    const built = buildPlan({
      tenant: draft.owner,
      runId,
      draft,
      graph,
      policy,
      signals,
      constraints,
    });

    if (!built.ok) {
      return fail(built.error);
    }

    const workspace = new SimulationWorkspace(built.value);
    const started = workspace.start(runId);
    if (!started.ok) {
      return fail(started.error);
    }

    this.runtimes.set(runId, workspace);
    this.registry.create(runId);

    return ok({
      runId: command.runId.toString(),
      snapshot: () => {
        const current = workspace.snapshot(runId);
        return current.ok ? current.value : undefined;
      },
      step: () => {
        const next = workspace.tick(runId);
        if (!next.ok) {
          this.registry.touch(runId, 'error', next.error.message);
          return next;
        }
        this.registry.touch(runId, 'step', `executed:${next.value.executedWaves}`);
        if (next.value.status === 'complete') {
          this.registry.markComplete(runId);
        }
        return next;
      },
    });
  }

  async status(runId: ReadinessRunId): Promise<Result<SimulationWorkspaceSnapshot, Error>> {
    const runtime = this.runtimes.get(runId);
    if (!runtime) {
      return fail(new Error(`simulation-not-found:${runId}`));
    }
    return runtime.snapshot(runId);
  }

  async step(runId: ReadinessRunId): Promise<Result<SimulationWorkspaceSnapshot, Error>> {
    const runtime = this.runtimes.get(runId);
    if (!runtime) {
      return fail(new Error(`simulation-not-found:${runId}`));
    }
    const result = runtime.tick(runId);
    if (!result.ok) {
      this.registry.touch(runId, 'error', result.error.message);
      return fail(result.error);
    }
    this.registry.touch(runId, 'step', `executed:${result.value.executedWaves}`);
    if (result.value.status === 'complete') {
      this.registry.markComplete(runId);
    }
    return result;
  }
}

export const createReadinessSimulationFacade = () => new RecoveryReadinessSimulationFacade();
export { runIdFromCommand };
