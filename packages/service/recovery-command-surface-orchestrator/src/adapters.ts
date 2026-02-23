import type {
  SurfacePolicy,
  SurfacePlan,
  SurfaceRun,
} from '@domain/recovery-command-surface-models';

export interface PolicyAdapter {
  loadPolicy(tenant: string): Promise<SurfacePolicy | undefined>;
  storePolicy(tenant: string, policy: SurfacePolicy): Promise<void>;
}

export interface RunObserver {
  onPhase(run: SurfaceRun, phase: string): void;
}

export interface CommandSurfaceOrchestratorAdapter {
  loadPlan(planId: string): Promise<SurfacePlan | undefined>;
  loadPolicy(tenant: string): Promise<SurfacePolicy | undefined>;
  saveRun(run: SurfaceRun): Promise<void>;
  saveSignal(runId: string, signal: { key: string; value: number; unit: string; timestamp: string }): Promise<void>;
}

export class NoopPolicyAdapter implements PolicyAdapter {
  private readonly policies = new Map<string, SurfacePolicy>();

  public async loadPolicy(tenant: string): Promise<SurfacePolicy | undefined> {
    return this.policies.get(tenant);
  }

  public async storePolicy(tenant: string, policy: SurfacePolicy): Promise<void> {
    this.policies.set(tenant, policy);
  }
}

export class NoopObserver implements RunObserver {
  public onPhase(): void {}
}
