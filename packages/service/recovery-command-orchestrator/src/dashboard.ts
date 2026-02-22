import type { IncidentPlan, OrchestrationRun, IncidentId, IncidentPlanId } from '@domain/recovery-incident-orchestration';
import type { CommandRunbook, PlaybookSimulation } from '@domain/incident-command-core';

export interface CommandWorkspaceSnapshotIncident {
  readonly id: IncidentId;
  readonly title: string;
  readonly runCount: number;
}

export interface CommandWorkspacePlanState {
  readonly planId: IncidentPlanId;
  readonly incidentId: IncidentId;
  readonly approved: boolean;
}

export interface CommandWorkspaceRunState {
  readonly runId: OrchestrationRun['id'];
  readonly nodeId: OrchestrationRun['nodeId'];
  readonly state: OrchestrationRun['state'];
}

export interface DashboardRunbookSnapshot {
  readonly runbookId: string;
  readonly incidentId: string;
  readonly state: 'draft' | 'queued' | 'running' | 'blocked' | 'finished' | 'cancelled';
  readonly risk: number;
  readonly commands: number;
  readonly warnings: number;
}

export interface RunbookBoardView {
  readonly incidents: readonly CommandWorkspaceSnapshotIncident[];
  readonly plans: readonly CommandWorkspacePlanState[];
  readonly runs: readonly CommandWorkspaceRunState[];
  readonly snapshots: readonly DashboardRunbookSnapshot[];
}

export const summarizeDashboardFromSimulation = (
  incidents: readonly CommandWorkspaceSnapshotIncident[],
  plans: readonly CommandWorkspacePlanState[],
  runs: readonly CommandWorkspaceRunState[],
  snapshots: readonly CommandRunbook[],
): RunbookBoardView => ({
  incidents,
  plans,
  runs,
  snapshots: snapshots.map((snapshot) => ({
    runbookId: snapshot.id,
    incidentId: String(snapshot.incidentId),
    state: snapshot.state,
    risk: snapshot.riskScore,
    commands: snapshot.playbook.commands.length,
    warnings: snapshot.plan.windows.length,
  })),
});

export const buildPlanSummary = (plan: IncidentPlan, runs: readonly OrchestrationRun[]): string =>
  `${String(plan.id)}:${plan.title}:${runs.length}:${plan.approved ? 'approved' : 'pending'}`;

export const flattenSimulation = (simulation: PlaybookSimulation): ReadonlyArray<{
  phase: number;
  commandId: string;
}> =>
  simulation.frameOrder.flatMap((commandId, index) => ({
    phase: index + 1,
    commandId,
  }));
