import {
  type OrchestratorContext,
  type OrchestrationPlan,
  type OrchestrationCommand,
} from '@service/recovery-drill-lab-orchestrator';
import { createScenarioId, createWorkspaceId, makeRunSeed, makeScenarioSeed, makeWorkspaceSeed, type DrillWorkspace, type DrillScenario } from '@domain/recovery-drill-lab';
import type { SurfaceCommand, SurfaceProfile, SurfaceGoal, SurfaceWindow, SurfaceSchedule } from './types';

const makeCommandId = (seed: string): string => `${seed}-${Date.now()}`;

const defaultGoalFor = (label: string): SurfaceGoal => ({
  label,
  scoreTarget: 82,
  riskTarget: 25,
  maxDurationMinutes: 90,
});

export const buildProfile = (tenant: string, zone: string, environment: 'dev' | 'staging' | 'prod'): SurfaceProfile => ({
  tenant,
  zone,
  environment,
  maxConcurrentRuns: Math.max(1, Math.min(5, tenant.length + zone.length)),
  preferredPriority: tenant.startsWith('ops-') ? 'high' : 'medium',
});

export const buildSurfaceWindow = (
  tenant: string,
  zone: string,
  from: string,
  profile: SurfaceProfile,
  to?: string,
): SurfaceWindow => ({
  id: `${tenant}-${zone}-${from}`,
  profile,
  from,
  to: to ?? new Date(new Date(from).toISOString()).toISOString(),
  createdAt: new Date().toISOString(),
  tags: [tenant, zone, profile.environment],
});

export const buildCommand = (
  tenant: string,
  workspaceId: string,
  scenarioId: string,
  profile: SurfaceProfile,
  requestedBy: string,
): SurfaceCommand => ({
  commandId: makeCommandId(`${tenant}-${workspaceId}-${scenarioId}`),
  type: 'run',
  workspaceId: createWorkspaceId(workspaceId),
  scenarioId: createScenarioId(scenarioId),
  goal: defaultGoalFor(`surface-${tenant}`),
  profile,
  requestedBy,
  requestedAt: new Date().toISOString(),
});

export const buildOrchestratorContext = (
  tenant: string,
  workspaceId: string,
  scenarioId: string,
): OrchestratorContext => ({
  tenant,
  workspaceId: createWorkspaceId(workspaceId),
  scenarioId: createScenarioId(scenarioId),
});

export const buildOrchestrationPlanFromWindow = (
  source: SurfaceWindow,
  workspace: DrillWorkspace,
  scenario: DrillScenario,
): OrchestrationPlan => {
  const baseCommands: readonly OrchestrationCommand[] = scenario.steps.map((step, index) => ({
    id: `${source.id}-cmd-${index}`,
    command: `surface-run:${scenario.id}:${step.id}`,
    name: `surface.${step.step}`,
    owner: workspace.metadata.ownerTeam,
    expectedMs: (index + 1) * 700,
  }));

  return {
    runId: `${workspace.id}-${scenario.id}-${source.id}`,
    workspace,
    scenario,
    commands: baseCommands,
    createdAt: source.createdAt,
  };
};

export const buildSurfaceSchedule = (
  command: SurfaceCommand,
  workspace: DrillWorkspace,
  scenarioId: string,
  durationMinutes: number,
): SurfaceSchedule => {
  const parsed = new Date(command.requestedAt);
  const started = new Date(parsed.getTime() + 5000).toISOString();

  return {
    workspace,
    scenarioId: createScenarioId(scenarioId),
    commandId: command.commandId,
    startedAt: started,
    expectedFinishAt: new Date(parsed.getTime() + durationMinutes * 60000).toISOString(),
    state: 'queued',
  };
};

export const synthesizeWorkspaceScenario = (
  command: SurfaceCommand,
): { workspace: DrillWorkspace; scenario: DrillScenario; snapshotSeed: ReturnType<typeof makeRunSeed> } => {
  const workspace = makeWorkspaceSeed(command.workspaceId, {
    tenant: command.profile.tenant,
    environment: command.profile.environment,
    ownerTeam: command.requestedBy,
  });

  const scenario = makeScenarioSeed(`${command.workspaceId}-${command.scenarioId}`, workspace.id);
  const snapshotSeed = makeRunSeed(workspace, scenario);
  return { workspace, scenario, snapshotSeed };
};
