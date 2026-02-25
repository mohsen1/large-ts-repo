import { z } from 'zod';
import type { Brand } from '@shared/core';
import {
  artifactId,
  runId,
  sessionId,
  tenantId,
  workspaceId,
  type ArtifactId,
  type RunId,
  type SessionId,
  type TenantId,
  type WorkspaceId,
} from '@shared/playbook-studio-runtime';

const severityEnum = z.enum(['critical', 'warning', 'info']);

export const studioCommandSchema = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('prepare'),
    tenantId: z.string(),
    workspaceId: z.string(),
    artifactId: z.string(),
    requestedBy: z.string(),
    strategy: z.enum(['reactive', 'predictive', 'safety']),
    sessionId: z.string().optional(),
  }),
  z.object({
    command: z.literal('execute'),
    tenantId: z.string(),
    workspaceId: z.string(),
    artifactId: z.string(),
    runId: z.string(),
    force: z.boolean().default(false),
  }),
  z.object({
    command: z.literal('audit'),
    tenantId: z.string(),
    workspaceId: z.string(),
    artifactId: z.string(),
    runId: z.string(),
  }),
  z.object({
    command: z.literal('refresh'),
    tenantId: z.string(),
    workspaceId: z.string(),
    artifactId: z.string(),
    stage: z.string().default('full'),
  }),
]);

export type StudioCommand = z.infer<typeof studioCommandSchema>;

export type StudioCommandNames = StudioCommand['command'];
export type StudioStage = 'prepare' | 'execute' | 'audit' | 'refresh';

export interface StudioTimelineEntry {
  readonly sequence: number;
  readonly stage: StudioCommandNames;
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly severity: z.infer<typeof severityEnum>;
  readonly message: string;
}

export interface StudioRunContext {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly artifactId: ArtifactId;
}

export const normalizeTenant = (value: string): TenantId => tenantId(value);
export const normalizeWorkspace = (value: string): WorkspaceId => workspaceId(value);
export const normalizeArtifact = (value: string): ArtifactId => artifactId(value);
export const normalizeRunId = (value: string): RunId => runId(value);
export const normalizeSessionId = (value: string): SessionId => sessionId(value);

export type SnapshotRecord<TScope extends string> = {
  readonly scope: TScope;
  readonly at: string;
  readonly values: readonly Brand<string, `Record${TScope & string}`>[];
};

export interface StudioScopeMap {
  readonly local: 'studio/local';
  readonly remote: 'studio/remote';
  readonly shared: 'studio/shared';
}

export const DEFAULT_SESSION_PREFIX = 'studio' as const;
export const STUDIO_SCOPE: StudioScopeMap = {
  local: 'studio/local',
  remote: 'studio/remote',
  shared: 'studio/shared',
} as const;
