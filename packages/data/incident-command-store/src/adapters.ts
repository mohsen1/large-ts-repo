import type { IncidentCommandRepository } from './repository';
import type { CommandStoreAudit as AuditModel, CommandStoreFilters } from './types';

export const normalizeAudit = (audit: AuditModel): AuditModel => ({
  ...audit,
  createdAt: new Date(audit.createdAt).toISOString(),
});

export const tenantFilters = (tenantId: string): CommandStoreFilters => ({
  tenantId,
  limit: 200,
});

export const summarizeRepository = async (repo: IncidentCommandRepository, tenantId: string): Promise<string[]> => {
  const [commands, plans, simulations] = await Promise.all([
    repo.listCommands(tenantFilters(tenantId)),
    repo.listPlans(tenantFilters(tenantId)),
    repo.listSimulations(tenantFilters(tenantId)),
  ]);

  const summary = [`tenant:${tenantId}`];
  if (commands.ok) summary.push(`commands:${commands.value.length}`);
  if (plans.ok) summary.push(`plans:${plans.value.length}`);
  if (simulations.ok) summary.push(`simulations:${simulations.value.length}`);
  return summary;
};
