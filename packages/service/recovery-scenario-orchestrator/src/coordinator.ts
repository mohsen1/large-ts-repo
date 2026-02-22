import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { TenantId } from '@domain/recovery-scenario-planner';
import type { StoredScenarioSummary } from '@data/recovery-scenario-store';
import type { ScenarioOrchestrationCommand, OrchestrationResult } from './commands';
import { compileSimulationArtifacts, persistSimulationArtifacts, notifyScenario, defaultClients, type ServiceDependencies } from './planner';

export class RecoveryScenarioOrchestrator {
  constructor(private readonly deps: ServiceDependencies) {
    this.deps.logger.info('recovery-scenario-orchestrator:initialized');
  }

  async run(command: ScenarioOrchestrationCommand): Promise<Result<OrchestrationResult, Error>> {
    const clients = this.deps.clients ?? defaultClients();
    const artifactsResult = compileSimulationArtifacts(command);
    if (!artifactsResult.ok) return fail(artifactsResult.error);

    const persisted = await persistSimulationArtifacts(artifactsResult.value, this.deps.repository);
    if (!persisted.ok) return fail(persisted.error);

    const notifyResult = await notifyScenario(artifactsResult.value, clients);
    if (!notifyResult.ok) return fail(notifyResult.error);

    return ok({
      scenarioId: artifactsResult.value.scenarioId,
      tenantId: command.tenantId,
      status: artifactsResult.value.output.status,
      eventIds: notifyResult.value,
      warningCount: artifactsResult.value.output.violations.length,
    });
  }

  async cancel(tenantId: TenantId, scenarioId: string): Promise<Result<void, Error>> {
    const list = await this.deps.repository.listByTenant(tenantId);
    if (!list.ok) return fail(list.error);

    const exists = list.value.some((entry: StoredScenarioSummary) => entry.scenarioId === (scenarioId as any));
    if (!exists) return fail(new Error(`scenario-not-found:${scenarioId}`));

    const scenario = await this.deps.repository.get(scenarioId as any);
    if (!scenario.ok) return fail(scenario.error);
    if (!scenario.value) return fail(new Error(`scenario-missing:${scenarioId}`));

    return this.deps.repository.archive(scenarioId as any);
  }
}
