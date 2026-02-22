import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  type ReadinessSimulationFacade,
  createReadinessSimulationFacade,
} from './readiness-simulation-orchestrator';
import type {
  RecoveryReadinessPlanDraft,
  ReadinessPolicy,
  ReadinessSignal,
  ReadinessRunId,
} from '@domain/recovery-readiness';

export interface RuntimeReport {
  readonly runId: string;
  readonly state: 'idle' | 'running' | 'blocked' | 'completed';
  readonly completedSignals?: number;
  readonly executedWaves?: number;
}

export interface ReadinessSimulationRuntimeInput {
  readonly tenant: string;
  readonly runId: ReadinessRunId;
  readonly draft: RecoveryReadinessPlanDraft;
  readonly policy: ReadinessPolicy;
  readonly signals: readonly ReadinessSignal[];
}

export const createRuntime = async ({
  runId,
  draft,
  policy,
  signals,
}: ReadinessSimulationRuntimeInput): Promise<Result<RuntimeReport, Error>> => {
  const facade: ReadinessSimulationFacade = createReadinessSimulationFacade();
  const runtime = await facade.start(runId, draft, policy, signals);
  if (!runtime.ok) {
    return fail(runtime.error);
  }
  const snapshot = runtime.value.snapshot();
  return ok({
    runId: snapshot?.runId.toString() ?? runId.toString(),
    state: snapshot?.status === 'complete' ? 'completed' : snapshot ? 'running' : 'blocked',
    completedSignals: snapshot?.completedSignals,
    executedWaves: snapshot?.executedWaves,
  });
};

export class RuntimeCoordinator {
  constructor(private readonly facade: ReadinessSimulationFacade = createReadinessSimulationFacade()) {}

  async launch(spec: ReadinessSimulationRuntimeInput): Promise<Result<RuntimeReport, Error>> {
    return createRuntime(spec);
  }

  async step(runId: ReadinessRunId): Promise<Result<RuntimeReport, Error>> {
    const step = await this.facade.step(runId);
    if (!step.ok) {
      return fail(step.error);
    }
    return ok({
      runId: runId.toString(),
      state: step.value.status === 'complete' ? 'completed' : 'running',
      completedSignals: step.value.completedSignals,
      executedWaves: step.value.executedWaves,
    });
  }
}

export const createCoordinator = () => new RuntimeCoordinator();
export { createReadinessSimulationFacade };
