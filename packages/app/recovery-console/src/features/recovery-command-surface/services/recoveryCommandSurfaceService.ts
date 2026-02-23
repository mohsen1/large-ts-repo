import { CommandSurfaceOrchestratorService } from '@service/recovery-command-surface-orchestrator';
import type { SurfacePlan, SurfaceRun } from '@domain/recovery-command-surface-models';
import { InMemorySurfaceCommandStore } from '@data/recovery-command-surface-store';

import type { RecoveryCommandSurfaceFilters } from '../types';

export interface SurfaceWorkspaceState {
  readonly tenant: string;
  readonly scopeLabel: string;
  readonly plans: readonly SurfacePlan[];
  readonly runs: readonly SurfaceRun[];
  readonly selectedPlanId: string | null;
  readonly selectedRunId: string | null;
  readonly running: boolean;
  readonly signalCount: number;
}

let singletonStore: InMemorySurfaceCommandStore | undefined;

const getStore = (): InMemorySurfaceCommandStore => {
  if (!singletonStore) {
    singletonStore = new InMemorySurfaceCommandStore();
  }
  return singletonStore;
};

export interface CreateRunInput {
  readonly tenant: string;
  readonly scopeLabel: string;
  readonly requestedBy: string;
  readonly scenario: string;
}

const createService = (tenant: string, scopeLabel: string): CommandSurfaceOrchestratorService =>
  new CommandSurfaceOrchestratorService({
    repository: getStore(),
    tenant,
    scopeLabel,
  });

export const upsertPlan = async (plan: SurfacePlan): Promise<void> => {
  const service = createService(plan.surface.tenant, `${plan.surface.region}-${plan.surface.zone}`);
  const result = await service.publishPlan(plan);
  if (!result.ok) {
    throw result.error;
  }
};

export const startRun = async (tenant: string, planId: string, requestedBy: string, scenario: string): Promise<SurfaceRun> => {
  const service = createService(tenant, `${tenant}-surface`);
  const started = await service.startRun(planId, requestedBy, scenario);
  if (!started.ok) {
    throw started.error;
  }
  return started.value;
};

export const listWorkspace = async (
  filters: RecoveryCommandSurfaceFilters = {},
): Promise<SurfaceWorkspaceState> => {
  const tenant = filters.tenant ?? 'default';
  const service = createService(tenant, `${tenant}-surface`);
  const summary = await service.summarize(40);
  const plans = await service.listPlans(tenant, 100);
  const runs: SurfaceRun[] = [];
  for (const plan of plans) {
    const runPage = await service.listRuns(plan.id);
    runs.push(...runPage);
  }
  const selectedPlanId = plans[0]?.id ?? null;
  const selectedRunId = runs[0]?.id ?? null;
  return {
    tenant: summary.tenant,
    scopeLabel: summary.scope,
    plans,
    runs,
    selectedPlanId,
    selectedRunId,
    running: runs.some((run) => run.state === 'in_flight' || run.state === 'scheduled'),
    signalCount: runs.reduce((sum, run) => sum + run.signals.length, 0),
  };
};
