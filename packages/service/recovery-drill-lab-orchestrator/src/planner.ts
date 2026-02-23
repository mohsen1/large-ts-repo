import type { OrchestrationCommand, OrchestrationPlan, OrchestratorContext } from './types';
import type { DrillLabRunRepository } from '@data/recovery-drill-lab-store';
import type { DrillLabRunId, DrillRunSnapshot } from '@domain/recovery-drill-lab';
import { makeRunSeed, makeScenarioSeed, makeWorkspaceSeed, createRunId } from '@domain/recovery-drill-lab';

const buildCommands = (scenarioName: string, stepCount: number): readonly OrchestrationCommand[] =>
  Array.from({ length: stepCount }, (_, index) => ({
    id: `${scenarioName}-cmd-${index}`,
    command: `run:${scenarioName}:${index + 1}`,
    name: `${scenarioName}-step-${index + 1}`,
    owner: 'platform',
    expectedMs: (index + 1) * 1000,
  }));

export const buildPlanFromContext = (repo: DrillLabRunRepository, context: OrchestratorContext): OrchestrationPlan => {
  const workspace = makeWorkspaceSeed(context.workspaceId, {
    tenant: context.tenant,
    environment: 'staging',
    ownerTeam: 'recovery-platform',
  });
  const scenario = makeScenarioSeed(context.scenarioId, workspace.id);

  repo.saveWorkspace(workspace);
  repo.saveScenario(scenario);

  const seed = makeRunSeed(workspace, scenario);
  repo.saveRun(seed);

  return {
    runId: seed.id,
    workspace,
    scenario,
    commands: buildCommands(scenario.title, scenario.steps.length),
    createdAt: seed.startedAt ?? new Date().toISOString(),
  };
};

export const snapshotFromPlan = (plan: OrchestrationPlan): DrillRunSnapshot => {
  const workspace = plan.workspace;
  const scenario = plan.scenario;
  const snapshot = makeRunSeed(workspace, scenario);
  return {
    ...snapshot,
    id: createRunId(`${plan.runId}-planned`),
    status: 'queued',
    metadata: {
      ...snapshot.metadata,
      commandCount: plan.commands.length,
      source: 'planner',
      createdAt: plan.createdAt,
    },
  };
};
