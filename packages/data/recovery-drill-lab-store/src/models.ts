import type {
  DrillRunEnvelope,
  DrillRunSnapshot,
  DrillScenario,
  DrillWorkspace,
  DrillRunQuery,
  DrillLabRunId,
  SnapshotChecksum,
  DrillRunWorkspaceResponse,
} from '@domain/recovery-drill-lab';

export interface WorkspaceSearchResult {
  readonly workspaces: readonly DrillWorkspace[];
  readonly pageToken: string | undefined;
}

export interface RunSearchResult {
  readonly data: readonly DrillRunEnvelope<DrillRunSnapshot>[];
  readonly cursor?: string;
  readonly hasMore: boolean;
  readonly requestId: DrillLabRunId;
}

export interface RunQueryEnvelope extends Pick<DrillRunQuery, 'from' | 'to' | 'status' | 'priority'> {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface StoreMutationResult<T> {
  readonly inserted: number;
  readonly removed: number;
  readonly payload: readonly T[];
}

export interface RunStoreState {
  readonly runsById: Map<string, DrillRunSnapshot>;
  readonly workspaceById: Map<string, DrillWorkspace>;
  readonly scenarioById: Map<string, DrillScenario>;
}

export interface RunWorkspaceView extends DrillRunWorkspaceResponse {
  readonly workspaceId: string;
  readonly filterFrom?: string;
  readonly filterTo?: string;
}

export interface StoredTelemetryPoint {
  readonly runId: DrillLabRunId;
  readonly checksum: SnapshotChecksum;
  readonly indexedAt: string;
}

export const isRunQueryEnvelope = (value: unknown): value is RunQueryEnvelope => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.from === undefined || typeof candidate.from === 'string';
};

export const makeRunEnvelope = (payload: DrillRunSnapshot, indexedAt?: string): DrillRunEnvelope<DrillRunSnapshot> => ({
  payload,
  checksum: `${payload.id}-${indexedAt ?? payload.updatedAt}` as SnapshotChecksum,
  indexedAt: indexedAt ?? payload.updatedAt,
});

export const workspaceSearchResult = (workspace: readonly DrillWorkspace[]): WorkspaceSearchResult => ({
  workspaces: workspace,
  pageToken: workspace[workspace.length - 1]?.id,
});
