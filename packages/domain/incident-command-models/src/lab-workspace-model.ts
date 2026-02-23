import type { CommandLabWorkspace, CommandLabSession, CommandLabWorkspaceId } from './lab-workflow-model';

export type { CommandLabWorkspace, CommandLabSession, CommandLabWorkspaceId };

export interface CommandLabWorkspaceSummary {
  readonly id: CommandLabWorkspaceId;
  readonly tenantId: string;
  readonly sessionCount: number;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly completedCount: number;
}

export const summarizeWorkspace = (workspace: CommandLabWorkspace): CommandLabWorkspaceSummary => {
  const statusCounts = workspace.sessionsByState;
  return {
    id: workspace.id,
    tenantId: workspace.tenantId,
    sessionCount: workspace.sessions.length,
    queuedCount: statusCounts.queued + statusCounts.blocked,
    runningCount: statusCounts.running,
    completedCount: statusCounts.completed,
  };
};

export const findSession = (workspace: CommandLabWorkspace, sessionId: CommandLabSession['id']): CommandLabSession | undefined =>
  workspace.sessions.find((session) => session.id === sessionId);
