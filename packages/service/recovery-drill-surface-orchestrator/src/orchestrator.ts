import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import { createOrchestrator } from '@service/recovery-drill-lab-orchestrator';
import type { DrillRunQuery, DrillRunSnapshot, DrillRunStatus, DrillWorkspaceId } from '@domain/recovery-drill-lab';
import { createRepository, type DrillLabRunRepository, runMatchesQuery } from '@data/recovery-drill-lab-store';
import {
  buildProfile,
  buildCommand,
  buildOrchestratorContext,
  synthesizeWorkspaceScenario,
} from './planner';
import { buildMinuteWindow, createScheduler, type SurfaceScheduler } from './scheduler';
import { makeAnalysis } from './analyzer';
import { parseCommand, parseWindow } from './validation';
import type {
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceProfile,
  SurfaceState,
  SurfaceWindow,
  SurfaceAnalysis,
} from './types';

export interface SurfaceOrchestratorConfig {
  readonly tenant: string;
  readonly zone: string;
  readonly environment: 'dev' | 'staging' | 'prod';
  readonly defaultScenarioId: string;
  readonly requestedBy: string;
  readonly repository?: DrillLabRunRepository;
}

interface WorkspaceSummary {
  readonly runCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly medianHealth: number;
}

export class SurfaceOrchestrator {
  private readonly profile: SurfaceProfile;
  private readonly repository: DrillLabRunRepository;
  private readonly orchestrator: ReturnType<typeof createOrchestrator>;
  private readonly scheduler: SurfaceScheduler;

  constructor(private readonly config: SurfaceOrchestratorConfig) {
    this.profile = buildProfile(config.tenant, config.zone, config.environment);
    this.repository = config.repository ?? createRepository();
    this.orchestrator = createOrchestrator(this.repository);
    this.scheduler = createScheduler();
  }

  public async runOnce(scenarioId = this.config.defaultScenarioId): Promise<Result<SurfaceCommandResult, Error>> {
    const command = this.buildCommand(scenarioId);
    this.scheduler.planCommands(this.profile, [command], [this.buildWindow(command)]);

    const context = buildOrchestratorContext(this.config.tenant, command.workspaceId, command.scenarioId);
    const result = await this.orchestrator.run(context);

    if (!result.ok) {
      return fail(result.error);
    }

    const snapshot = result.value.snapshot;
    const workspace = this.synthesizeWorkspace(command).workspace;
    this.repository.saveRun(snapshot);
    this.scheduler.markCompleted(snapshot, true);

    return ok({
      command,
      workspace,
      snapshot,
      analysis: makeAnalysis(snapshot),
    });
  }

  public runDry(scenarioId = this.config.defaultScenarioId): Result<SurfaceCommandResult, Error> {
    const command = this.buildCommand(scenarioId);
    this.scheduler.planCommands(this.profile, [command], [this.buildWindow(command)]);
    const seed = this.synthesizeWorkspace(command);

    return ok({
      command,
      workspace: seed.workspace,
      snapshot: seed.snapshotSeed,
      analysis: makeAnalysis(seed.snapshotSeed),
    });
  }

  public listAnalysis(workspaceId: string, status?: readonly DrillRunStatus[]): readonly SurfaceAnalysis[] {
    const queryWorkspaceId = withBrand(workspaceId, 'DrillWorkspaceId');
    const runs = this.repository.listRuns({ workspaceId: queryWorkspaceId, status });
    const filtered = status && status.length > 0 ? this.scheduler.filterRunsByStatus(runs, [...status]) : runs;
    return filtered.map((run) => makeAnalysis(run));
  }

  public summarizeWorkspace(workspaceId: string): WorkspaceSummary {
    const queryWorkspaceId = withBrand(workspaceId, 'DrillWorkspaceId');
    const runs = this.repository.listRuns({ workspaceId: queryWorkspaceId });
    const completedCount = runs.filter((run) => run.status === 'completed').length;
    const failedCount = runs.filter((run) => run.status === 'failed').length;

    const sortedByHealth = runs
      .map((run) => makeAnalysis(run).score)
      .sort((left, right) => left - right);

    return {
      runCount: runs.length,
      completedCount,
      failedCount,
      medianHealth: sortedByHealth.length === 0
        ? 0
        : sortedByHealth[Math.floor(sortedByHealth.length / 2)] ?? 0,
    };
  }

  public workspaceState(): SurfaceState {
    return this.scheduler.stateSnapshot;
  }

  public windowIdsForWorkspace(workspaceId: string): readonly string[] {
    return this.scheduler.windowKeys.filter((key) => key.includes(workspaceId));
  }

  public clearWorkspace(workspaceId: string): readonly string[] {
    return this.scheduler.dequeueByWorkspace(workspaceId).map((schedule) => schedule.commandId);
  }

  public isStatusMatch(snapshot: DrillRunSnapshot, query: DrillRunQuery): boolean {
    return runMatchesQuery(snapshot, query);
  }

  private buildCommand(scenarioId: string): SurfaceCommand {
    const raw = buildCommand(this.config.tenant, `${this.profile.tenant}-ws`, scenarioId, this.profile, this.config.requestedBy);
    const parsed = parseCommand(raw);
    if (!parsed) {
      throw new Error('invalid surface command');
    }
    return parsed;
  }

  private buildWindow(command: SurfaceCommand): SurfaceWindow {
    const proposed = buildMinuteWindow(command.requestedAt, 45);
    return parseWindow(proposed) ?? proposed;
  }

  private synthesizeWorkspace(command: SurfaceCommand) {
    return synthesizeWorkspaceScenario(command);
  }
}

export const createSurfaceOrchestrator = (config: SurfaceOrchestratorConfig): SurfaceOrchestrator => new SurfaceOrchestrator(config);

export const summarizeLatestForTenant = (tenant: string, repository: DrillLabRunRepository = createRepository()): number => {
  const tenantWorkspace = withBrand(`${tenant}-ws`, 'DrillWorkspaceId');
  return repository.countRunsByWorkspace().get(tenantWorkspace) ?? 0;
};
