import { z } from 'zod';
import {
  type PlaybookCatalogManifest,
  type PlaybookExecutionTrace,
  type PlaybookNode,
  type PluginTag,
  type RunId,
  type TenantId,
  type WorkspaceId,
} from '@domain/recovery-ops-playbook-studio';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export interface StudioRunRecord {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly status: 'idle' | 'running' | 'succeeded' | 'failed';
}

export interface StudioLogEntry {
  readonly runId: RunId;
  readonly at: string;
  readonly tag: PluginTag;
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error';
}

export interface StudioArtifact {
  readonly id: string;
  readonly runId: RunId;
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface StudioWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly tenantId: TenantId;
  readonly catalog: PlaybookCatalogManifest;
  readonly nodes: readonly PlaybookNode[];
  readonly manifests: ReadonlyMap<string, PlaybookCatalogManifest>;
  readonly createdAt: string;
}

export interface WorkspaceQuery {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly includeArchived?: boolean;
  readonly tagPrefix?: string;
  readonly limit?: number;
}

export interface StudioRepository {
  seedWorkspace(workspace: StudioWorkspace): Promise<Result<void, string>>;
  saveRun(run: StudioRunRecord): Promise<Result<void, string>>;
  getRun(runId: RunId): Promise<Result<StudioRunRecord | undefined, string>>;
  appendLog(entry: StudioLogEntry): Promise<Result<void, string>>;
  listRuns(query: WorkspaceQuery): Promise<Result<readonly StudioRunRecord[], string>>;
  listLogs(runId: RunId, limit?: number): Promise<Result<readonly StudioLogEntry[], string>>;
  saveArtifacts(runId: RunId, artifacts: readonly StudioArtifact[]): Promise<Result<void, string>>;
  listArtifacts(runId: RunId): Promise<Result<readonly StudioArtifact[], string>>;
  saveTrace(trace: PlaybookExecutionTrace): Promise<Result<void, string>>;
  streamTraces(runId: RunId): Promise<Result<AsyncIterable<PlaybookExecutionTrace>, string>>;
  [Symbol.asyncDispose](): Promise<void>;
}

const timestamped = (): string => new Date().toISOString();
const safeTimestamp = (value: unknown): string => {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : timestamped();
};

const WorkspaceIdSchema = z.string().startsWith('workspace:').brand<WorkspaceId>();
const TenantIdSchema = z.string().startsWith('tenant:').brand<TenantId>();
const RunIdSchema = z.string().min(15).brand<RunId>();
const TimestampSchema = z
  .string()
  .refine((raw) => Number.isFinite(Date.parse(raw)));

const PlaybookNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  phase: z.union([
    z.literal('discover'),
    z.literal('plan'),
    z.literal('simulate'),
    z.literal('execute'),
    z.literal('verify'),
    z.literal('finalize'),
  ]),
  tags: z.array(z.string()),
});

const ManifestRecordSchema = z.record(z.unknown());
export const StudioWorkspaceSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  tenantId: TenantIdSchema,
  catalog: z.unknown().transform((raw) => raw as PlaybookCatalogManifest),
  nodes: z.array(PlaybookNodeSchema),
  manifests: ManifestRecordSchema,
  createdAt: TimestampSchema,
});

export const assertRunRecord = (run: StudioRunRecord): Result<StudioRunRecord, string> => {
  const parsed = z
    .object({
      runId: RunIdSchema,
      tenantId: TenantIdSchema,
      workspaceId: WorkspaceIdSchema,
      startedAt: TimestampSchema,
      updatedAt: TimestampSchema,
      status: z.union([
        z.literal('idle'),
        z.literal('running'),
        z.literal('succeeded'),
        z.literal('failed'),
      ]),
      payload: z.record(z.unknown()),
    })
    .safeParse(run);
  if (!parsed.success) {
    return fail(parsed.error.issues.at(0)?.message ?? 'invalid-run-record');
  }
  if (Date.parse(parsed.data.startedAt) > Date.parse(parsed.data.updatedAt)) {
    return fail('invalid-run-order');
  }
  return ok(parsed.data as unknown as StudioRunRecord);
};

export const defaultWorkspaceFrom = (
  tenantId: string,
  workspaceId: string,
  catalog: PlaybookCatalogManifest,
): Omit<StudioWorkspace, 'manifests'> => {
  return {
    tenantId: `tenant:${tenantId}` as TenantId,
    workspaceId: `workspace:${workspaceId}` as WorkspaceId,
    catalog,
    nodes: catalog.entries.map((entry, index) => ({
      id: toPlaybookNodeId(`${catalog.namespace}:${entry.name}:${index}`),
      name: entry.name,
      phase: entry.stage,
      tags: [...entry.labels],
    })),
    createdAt: timestamped(),
  };
};

export const normalizeWorkspaceQuery = (query: WorkspaceQuery): Required<WorkspaceQuery> => ({
  tenantId: query.tenantId ?? ('tenant:default' as TenantId),
  workspaceId: query.workspaceId ?? ('workspace:default' as WorkspaceId),
  includeArchived: query.includeArchived ?? false,
  tagPrefix: query.tagPrefix ?? '',
  limit: Math.max(1, Math.min(query.limit ?? 50, 500)),
});

const toPlaybookNodeId = (value: string): PlaybookNode['id'] => value as PlaybookNode['id'];

export const mapWorkspaceId = (tenantId: string, workspaceId: string): WorkspaceId =>
  `workspace:${workspaceId}` as WorkspaceId;

export const mapTenantId = (tenantId: string): TenantId => `tenant:${tenantId}` as TenantId;
