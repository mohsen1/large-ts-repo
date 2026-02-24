import type { OrchestratorInput, PluginExecutionSummary } from '@domain/recovery-ops-orchestration-graph';

export type WorkspaceRow = {
  readonly pluginId: string;
  readonly stage: string;
  readonly status: 'pending' | 'running' | 'complete' | 'failed';
  readonly score: number;
};

export type SignalFeedItem = {
  readonly id: string;
  readonly label: string;
  readonly severity: number;
  readonly at: string;
  readonly values: number[];
};

export interface GraphLabWorkspaceState {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly incidentId: string;
  readonly profileId: string;
  readonly rows: readonly WorkspaceRow[];
  readonly signals: readonly SignalFeedItem[];
  readonly running: boolean;
  readonly runCount: number;
  readonly diagnostics: readonly PluginExecutionSummary[];
  readonly selectedPluginIds: readonly string[];
};

export interface GraphLabWorkspaceResult {
  readonly input: OrchestratorInput;
  readonly rows: readonly WorkspaceRow[];
  readonly signals: readonly SignalFeedItem[];
  readonly diagnostics: readonly PluginExecutionSummary[];
}
