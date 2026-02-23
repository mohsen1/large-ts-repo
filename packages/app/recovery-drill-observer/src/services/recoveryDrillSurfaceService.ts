import { createSurfaceOrchestrator, summarizeLatestForTenant, type SurfaceCommandResult } from '@service/recovery-drill-surface-orchestrator';
import { createRepository } from '@data/recovery-drill-lab-store';
import type { Result } from '@shared/result';

const repository = createRepository();
const orchestrator = createSurfaceOrchestrator({
  tenant: 'ops-core',
  zone: 'global',
  environment: 'staging',
  defaultScenarioId: 'scenario-main',
  requestedBy: 'app-observer',
  repository,
});

export const launchSurfaceRun = async (): Promise<Result<SurfaceCommandResult, Error>> => {
  return orchestrator.runOnce();
};

export const launchSurfaceDryRun = (): Result<SurfaceCommandResult, Error> => {
  return orchestrator.runDry();
};

export const summarizeSurfaceByTenant = (tenant: string): number => {
  return summarizeLatestForTenant(tenant, repository);
};
