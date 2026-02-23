import type {
  DrillWorkspaceId,
  DrillScenarioId,
  DrillRunSnapshot,
  DrillRunQuery,
  DrillWorkspacePage,
  DrillWorkspace,
  DrillScenario,
} from '@domain/recovery-drill-lab';

export interface OrchestratorContext {
  readonly tenant: string;
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
}

export interface OrchestrationCommand {
  readonly id: string;
  readonly command: string;
  readonly name: string;
  readonly owner: string;
  readonly expectedMs: number;
}

export interface OrchestrationPlan {
  readonly runId: string;
  readonly workspace: DrillWorkspace;
  readonly scenario: DrillScenario;
  readonly commands: readonly OrchestrationCommand[];
  readonly createdAt: string;
}

export interface OrchestrationOutcome {
  readonly snapshot: DrillRunSnapshot;
  readonly commands: readonly OrchestrationCommand[];
  readonly errors: readonly string[];
  readonly query: DrillRunQuery;
}

export interface OrchestratorFactory {
  createPlan(context: OrchestratorContext): OrchestrationPlan;
  run(plan: OrchestrationPlan): Promise<{
    snapshot: DrillRunSnapshot;
    commands: readonly OrchestrationCommand[];
    query: DrillRunQuery;
    errors: readonly string[];
  }>;
}

export type OrchestratorRunReport = {
  readonly context: OrchestratorContext;
  readonly query: DrillRunQuery;
  readonly requestedAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly hasErrors: boolean;
  readonly workspacePage: DrillWorkspacePage;
};
