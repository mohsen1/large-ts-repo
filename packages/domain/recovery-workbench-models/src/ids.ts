import type { Brand } from '@shared/recovery-workbench-runtime';

export type WorkbenchTenantId = Brand<string, 'WorkbenchTenantId'>;
export type WorkbenchWorkspaceId = Brand<string, 'WorkbenchWorkspaceId'>;
export type WorkbenchRunId = Brand<string, 'WorkbenchRunId'>;
export type WorkbenchPluginId = Brand<string, 'WorkbenchPluginId'>;

const token = (candidate: string): boolean => /^[a-zA-Z0-9._-]{3,}$/.test(candidate);

const safe = (candidate: string): string => candidate.trim().toLowerCase();

export const makeTenantId = (tenant: string): WorkbenchTenantId => {
  const next = safe(tenant);
  if (!token(next)) {
    throw new Error(`invalid tenant token ${tenant}`);
  }
  return `tenant:${next}` as WorkbenchTenantId;
};

export const makeWorkspaceId = (tenant: string, workspace: string): WorkbenchWorkspaceId => {
  const nextTenant = safe(tenant);
  const nextWorkspace = safe(workspace);
  if (!token(nextTenant) || !token(nextWorkspace)) {
    throw new Error(`invalid workspace identity ${tenant}/${workspace}`);
  }
  return `workspace:${nextTenant}#${nextWorkspace}` as WorkbenchWorkspaceId;
};

export const makeRunId = (tenant: string, workspace: string, sequence: string): WorkbenchRunId => {
  const nextTenant = safe(tenant);
  const nextWorkspace = safe(workspace);
  const nextSequence = safe(sequence);
  if (!token(nextTenant) || !token(nextWorkspace) || !token(nextSequence)) {
    throw new Error(`invalid run identity ${tenant}/${workspace}/${sequence}`);
  }
  return `run:${nextTenant}:${nextWorkspace}:${nextSequence}` as WorkbenchRunId;
};

export const makePluginId = (namespace: string, plugin: string): WorkbenchPluginId => {
  const nextNamespace = safe(namespace);
  const nextPlugin = safe(plugin);
  if (!token(nextNamespace) || !token(nextPlugin)) {
    throw new Error(`invalid plugin id ${namespace}/${plugin}`);
  }
  return `${nextNamespace}/${nextPlugin}` as WorkbenchPluginId;
};

export const splitWorkspaceId = (value: WorkbenchWorkspaceId): { tenant: string; workspace: string } => {
  const [, rawTenantWorkspace] = value.split(':', 2);
  const [tenant, workspace] = rawTenantWorkspace?.split('#') ?? [];
  return {
    tenant: tenant ?? 'tenant',
    workspace: workspace ?? 'default',
  };
};
