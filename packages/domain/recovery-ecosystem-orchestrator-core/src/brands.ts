import type { Brand } from '@shared/core';
import type { PluginName } from '@shared/typed-orchestration-core';

export type TenantId = Brand<`tenant:${string}`, 'RecoveryEcosystemTenantId'>;
export type WorkspaceId = Brand<`workspace:${string}`, 'RecoveryEcosystemWorkspaceId'>;
export type TenantWorkspace = Brand<`${TenantId}/${WorkspaceId}`, 'RecoveryEcosystemTenantWorkspace'>;
export type RunId = Brand<`run:${TenantId}:${WorkspaceId}:${string}`, 'RecoveryEcosystemRunId'>;
export type PluginId = PluginName;
export type SignalId = Brand<`signal:${string}`, 'RecoveryEcosystemSignalId'>;
export type TimelineEventId = Brand<`timeline:${string}`, 'RecoveryEcosystemTimelineEventId'>;

export type PluginStage = Brand<
  `stage:${'discover' | 'model' | 'simulate' | 'optimize' | 'execute' | 'verify' | 'archive'}`,
  'RecoveryEcosystemPluginStage'
>;

export const TENANT_ID_PREFIX = 'tenant';
export const WORKSPACE_ID_PREFIX = 'workspace';
export const RUN_ID_PREFIX = 'run';
export const PLUGIN_ID_PREFIX = 'mesh';

export const isTenantId = (value: string): value is TenantId => value.startsWith(`${TENANT_ID_PREFIX}:`);
export const isWorkspaceId = (value: string): value is WorkspaceId => value.startsWith(`${WORKSPACE_ID_PREFIX}:`);
export const isRunId = (value: string): value is RunId => value.startsWith(`${RUN_ID_PREFIX}:`);
export const isPluginId = (value: string): value is PluginId => value.startsWith(`${PLUGIN_ID_PREFIX}:`);

export const parseTenantWorkspace = (value: TenantWorkspace): {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
} => {
  const [tenant, workspace] = value.split('/') as [string, string];
  return {
    tenantId: `${TENANT_ID_PREFIX}:${tenant.split(':').at(1) ?? ''}` as TenantId,
    workspaceId: `${WORKSPACE_ID_PREFIX}:${workspace?.split(':').at(1) ?? ''}` as WorkspaceId,
  };
};

export const parseRunId = (value: string): RunId | null => {
  return isRunId(value) ? (value as RunId) : null;
};

export const formatRunId = (tenantId: TenantId, workspaceId: WorkspaceId, suffix: string): RunId => {
  return `${RUN_ID_PREFIX}:${tenantId}:${workspaceId}:${suffix}` as RunId;
};
