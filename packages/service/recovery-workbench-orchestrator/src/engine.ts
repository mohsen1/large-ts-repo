import { RecoveryWorkbenchOrchestrator, createOrchestrator } from './orchestrator';
import { bootstrap } from './bootstrap';
import { makeTenantId, makeWorkspaceId, type WorkbenchRunOutput } from '@domain/recovery-workbench-models';

export type ReplayMode = 'single' | 'repeat';

export interface ReplayOptions {
  readonly tenant: string;
  readonly workspace: string;
  readonly mode: ReplayMode;
}

export interface ReplaySummary {
  readonly total: number;
  readonly runs: readonly WorkbenchRunOutput[];
  readonly tenant: string;
  readonly workspace: string;
}

const phasePlan = ['ingest', 'score', 'publish'] as const;

export const replay = async (options: ReplayOptions): Promise<ReplaySummary> => {
  const orchestrator = new RecoveryWorkbenchOrchestrator({
    tenantId: makeTenantId(options.tenant),
    workspaceId: makeWorkspaceId(options.tenant, options.workspace),
    catalog: bootstrap.catalog,
    profile: bootstrap.profile,
  });

  const iterations = options.mode === 'repeat' ? 3 : 1;
  const runs: WorkbenchRunOutput[] = [];
  let total = 0;

  for (let index = 0; index < iterations; index += 1) {
    const result = await orchestrator.run({
      tenantId: makeTenantId(options.tenant),
      workspaceId: makeWorkspaceId(options.tenant, options.workspace),
      requestedBy: `replay-${index}`,
      phases: [...phasePlan],
      routes: ['route:ingest', 'route:score', 'route:publish'],
      metadata: { mode: options.mode },
    });

    if (result.output) {
      total += result.output.totalDurationMs;
      runs.push(result.output);
    }
  }

  await orchestrator.close();

  return {
    total,
    runs,
    tenant: options.tenant,
    workspace: options.workspace,
  };
};

export const createReplayOrchestrator = (): RecoveryWorkbenchOrchestrator =>
  createOrchestrator({
    tenantId: bootstrap.tenantId,
    workspaceId: bootstrap.workspaceId,
    catalog: bootstrap.catalog,
    profile: bootstrap.profile,
  });
