import { runObservabilityScenario, type OrchestrationSessionResult } from './engine';
import { ok, fail, type Result } from '@shared/result';
import { toObservabilityContext, type ObservabilityScope } from '@domain/recovery-playbook-observability-core';

export interface OrchestratorCommand {
  readonly tenantId: string;
  readonly playbook: string;
  readonly scopes: readonly ObservabilityScope[];
}

export interface OrchestratorDashboard {
  readonly command: OrchestratorCommand;
  readonly contextSignature: string;
}

export const createDashboard = (command: OrchestratorCommand): Result<OrchestratorDashboard, string> => {
  if (command.scopes.length === 0) {
    return fail('dashboard-scope-empty');
  }

  const context = toObservabilityContext({
    tenantIdValue: command.tenantId,
    playbook: command.playbook,
    run: '1',
    scopes: [command.scopes[0]],
    stage: 'observed',
    tagSeed: command.playbook,
  });
  return ok({
    command,
    contextSignature: `${context.tenantId}:${context.playbookId}:${context.runId}:${context.stage}`,
  });
};

export const runDashboardScenario = async (
  command: OrchestratorCommand,
): Promise<Result<OrchestrationSessionResult, string>> => {
  const dashboard = createDashboard(command);
  if (!dashboard.ok) {
    return fail(dashboard.error);
  }
  return runObservabilityScenario({
    tenantId: command.tenantId,
    playbook: command.playbook,
    scopes: command.scopes,
  });
};

