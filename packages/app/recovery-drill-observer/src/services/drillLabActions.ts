import { createOrchestrator } from '@service/recovery-drill-lab-orchestrator';
import { createRepository, type DrillLabRunRepository } from '@data/recovery-drill-lab-store';
import {
  type DrillWorkspaceId,
  type DrillScenarioId,
  type DrillRunQuery,
  createWorkspaceId,
  createScenarioId,
} from '@domain/recovery-drill-lab';
import { ok, fail, type Result } from '@shared/result';
import { withBrand } from '@shared/core';

const repository = createRepository();
const orchestrator = createOrchestrator(repository);

export interface DrillLabState {
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
  readonly commandCount: number;
}

export interface CommandResult {
  readonly started: boolean;
  readonly tenant: string;
  readonly runId?: string;
}

const toWorkspaceId = (value: string): DrillWorkspaceId => withBrand(value, 'DrillWorkspaceId');
const toScenarioId = (value: string): DrillScenarioId => withBrand(value, 'DrillScenarioId');

export const runDrillPlan = async (
  payload: { tenant: string; workspaceId: string; scenarioId: string },
): Promise<Result<CommandResult, Error>> => {
  const workspaceId = toWorkspaceId(payload.workspaceId);
  const scenarioId = toScenarioId(payload.scenarioId);

  const result = await orchestrator.run({
    tenant: payload.tenant,
    workspaceId,
    scenarioId,
  });

  if (!result.ok) {
    return fail(result.error);
  }

  return ok({
    started: true,
    tenant: payload.tenant,
    runId: result.value.snapshot.id,
  });
};

export const runDryPlan = () => {
  return orchestrator.runDry({
    tenant: 'tenant-dry',
    workspaceId: createWorkspaceId('ws-demo'),
    scenarioId: createScenarioId('scenario-demo'),
  });
};

export const listQueries = (query: DrillRunQuery, repositoryRef: DrillLabRunRepository = repository) =>
  repositoryRef.searchRunEnvelopes(query);

export const buildLabState = (workspaceId: string, scenarioId: string): DrillLabState => {
  const workspaceBrand = toWorkspaceId(workspaceId);
  const scenarioBrand = toScenarioId(scenarioId);

  return {
    workspaceId: workspaceBrand,
    scenarioId: scenarioBrand,
    commandCount: repository.searchRunEnvelopes({ workspaceId: workspaceBrand, scenarioId: scenarioBrand }).data.length,
  };
};
