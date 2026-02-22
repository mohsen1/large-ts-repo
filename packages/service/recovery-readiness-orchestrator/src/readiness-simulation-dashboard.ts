import type {
  RecoveryReadinessPlanDraft,
  ReadinessPolicy,
  ReadinessSignal,
  ReadinessRunId,
} from '@domain/recovery-readiness';
import { type ReadinessSimulationFacade, createReadinessSimulationFacade, type ReadinessSimulationRuntime } from './readiness-simulation-orchestrator';
import { createCoordinator, type RuntimeReport } from './readiness-simulation';

export interface ReadinessSimulationDashboardPage {
  readonly tenant: string;
  readonly runId: string;
  readonly state: 'idle' | 'running' | 'completed' | 'blocked';
}

export interface SimulationDraftSpec {
  readonly draft: RecoveryReadinessPlanDraft;
  readonly policy: ReadinessPolicy;
  readonly signals: readonly ReadinessSignal[];
}

export class ReadinessSimulationDashboard {
  private readonly coordinator = createCoordinator();
  private readonly runtimeByTenant = new Map<string, ReadinessSimulationRuntime>();
  private readonly facade: ReadinessSimulationFacade = createReadinessSimulationFacade();

  async launch(
    tenant: string,
    runId: ReadinessRunId,
    spec: SimulationDraftSpec,
  ): Promise<ReadinessSimulationDashboardPage> {
    const launched = await this.coordinator.launch({
      tenant,
      runId,
      draft: spec.draft,
      policy: spec.policy,
      signals: spec.signals,
    });

    if (!launched.ok) {
      return { tenant, runId: runId.toString(), state: 'blocked' };
    }

    const runtime = await this.facade.start(runId, spec.draft, spec.policy, spec.signals);
    if (!runtime.ok) {
      return { tenant, runId: runId.toString(), state: 'blocked' };
    }
    this.runtimeByTenant.set(tenant, runtime.value);

    return { tenant, runId: runId.toString(), state: launched.value.state };
  }

  async stepAndReport(runId: ReadinessRunId): Promise<{ ok: true; value: RuntimeReport } | { ok: false; error: Error }> {
    const next = await this.coordinator.step(runId);
    if (!next.ok) {
      return { ok: false, error: next.error };
    }

    const runtime = this.runtimeByTenant.get(runId.toString());
    if (!runtime) {
      return { ok: false, error: new Error(`runtime-not-found:${runId}`) };
    }

    const snapshot = runtime.snapshot();
    return {
      ok: true,
      value: {
        runId: runId.toString(),
        state: snapshot?.status === 'complete' ? 'completed' : 'running',
        completedSignals: snapshot?.completedSignals,
        executedWaves: snapshot?.executedWaves,
      },
    };
  }

  async inspect(runId: ReadinessRunId): Promise<{ ok: true; value: RuntimeReport } | undefined> {
    const status = await this.facade.status(runId);
    if (!status.ok) {
      return undefined;
    }
    return {
      ok: true,
      value: {
        runId: status.value.runId.toString(),
        state: status.value.status === 'complete' ? 'completed' : 'running',
        completedSignals: status.value.completedSignals,
        executedWaves: status.value.executedWaves,
      },
    };
  }
}

export const createReadinessSimulationDashboard = () => new ReadinessSimulationDashboard();
