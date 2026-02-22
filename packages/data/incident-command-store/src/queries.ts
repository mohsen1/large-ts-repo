import type { CommandStoreFilters } from './types';
import type { StoreHealth, CommandTimelineSegment } from './models';
import type { IncidentCommandRepository } from './repository';

export const commandLineage = (
  tenantId: string,
  limit: number,
  repo: IncidentCommandRepository,
): Promise<readonly CommandTimelineSegment[]> =>
  repo
    .getAuditTrail(tenantId)
    .then((result) =>
      result.ok
        ? result.value
            .slice(0, Math.max(1, limit))
            .map((entry) => {
              const parts = entry.note.split(':');
              const maybeCommand = parts.at(-1) ?? 'unknown';
              return {
                at: entry.createdAt,
                commandId: maybeCommand,
                event: entry.action === 'create' || entry.action === 'update' ? 'updated' : 'finished',
                actor: `system:${entry.commandStoreId}`,
              } as CommandTimelineSegment;
            })
        : [],
    );

export const readHealth = async (repo: IncidentCommandRepository): Promise<StoreHealth> => {
  const [commands, plans, simulations, executions] = await Promise.all([
    repo.listCommands({} as CommandStoreFilters),
    repo.listPlans({} as CommandStoreFilters),
    repo.listSimulations({} as CommandStoreFilters),
    repo.listExecutions({} as CommandStoreFilters),
  ]);

  const lastMutationAt = Math.max(
    commands.ok ? Date.parse(commands.value[0]?.updatedAt ?? '') : 0,
    plans.ok ? Date.parse(plans.value[0]?.createdAt ?? '') : 0,
    simulations.ok ? Date.parse(simulations.value[0]?.createdAt ?? '') : 0,
    executions.ok ? Date.parse(executions.value[0]?.startedAt ?? '') : 0,
  );

  return {
    commandCount: commands.ok ? commands.value.length : 0,
    planCount: plans.ok ? plans.value.length : 0,
    simulationCount: simulations.ok ? simulations.value.length : 0,
    executionCount: executions.ok ? executions.value.length : 0,
    lastMutationAt: Number.isFinite(lastMutationAt) ? new Date(lastMutationAt).toISOString() : null,
  };
};

export const isTenantEmpty = async (tenantId: string, repo: IncidentCommandRepository): Promise<boolean> => {
  const result = await repo.listCommands({ tenantId, limit: 1 });
  return !result.ok || result.value.length === 0;
};
