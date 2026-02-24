import type {
  PluginState,
  PlaybookCatalogManifest,
  PlaybookExecutionTrace,
  PlaybookPluginDefinition,
  RunId,
  TenantId,
  WorkspaceId,
} from '@domain/recovery-ops-playbook-studio';

export interface OrchestratorRequest {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly runId?: string;
  readonly selectedStages: readonly PluginState[];
  readonly context: {
    readonly region: string;
    readonly correlationId: string;
    readonly operator: string;
  };
  readonly input: Record<string, unknown>;
  readonly plugins?: readonly PlaybookPluginDefinition[];
}

export interface OrchestratorResult {
  readonly runId: RunId;
  readonly status: 'queued' | 'running' | 'complete' | 'errored';
  readonly artifactCount: number;
  readonly diagnostics: readonly string[];
  readonly trace: PlaybookExecutionTrace;
}

export interface OrchestratorSnapshot {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly catalog: PlaybookCatalogManifest;
  readonly activeRunCount: number;
  readonly completeRunCount: number;
}

export interface OrchestratorOptions {
  readonly concurrency: number;
  readonly retryLimit: number;
  readonly heartbeatMs: number;
  readonly autoPersist: boolean;
}

export type ProgressFn = (status: string, payload: Record<string, unknown>) => void;

export interface OrchestratorConfig {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly catalog: PlaybookCatalogManifest;
  readonly options?: Partial<OrchestratorOptions>;
  readonly progress?: ProgressFn;
}
