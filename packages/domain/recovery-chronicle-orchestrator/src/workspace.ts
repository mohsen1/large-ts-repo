import { asChronicleTenantId } from '@domain/recovery-chronicle-core';
import type {
  OrchestrationPolicy,
  OrchestrationStageDescriptor,
  OrchestrationWorkspace,
  OrchestrationWorkspaceId,
} from './types';
import { buildWorkspaceId, defaultPolicy } from './types';

interface WorkspaceTemplate {
  readonly tenant: string;
  readonly policy?: OrchestrationPolicy;
  readonly stages?: readonly OrchestrationStageDescriptor[];
}

type WorkspaceTemplateView<T extends WorkspaceTemplate> = {
  [K in keyof T as K extends `__${string}` ? never : `workspace.${Extract<K, string>}`]: T[K];
};

export const buildWorkspace = (input: WorkspaceTemplate): OrchestrationWorkspace => {
  const tenant = asChronicleTenantId(input.tenant);
  const policy = input.policy ?? defaultPolicy(input.tenant);
  return {
    workspaceId: buildWorkspaceId(tenant),
    tenant,
    policy,
    stages: input.stages ?? [],
  };
};

export const withWorkspaceTemplate = <TWorkspace extends WorkspaceTemplate>(workspace: TWorkspace): WorkspaceTemplateView<TWorkspace> =>
  workspace as unknown as WorkspaceTemplateView<TWorkspace>;

export const upsertWorkspace = (
  workspace: OrchestrationWorkspace,
  stage: OrchestrationStageDescriptor,
): OrchestrationWorkspace => ({
  ...workspace,
  stages: workspace.stages.some((entry) => entry.id === stage.id) ? workspace.stages : [...workspace.stages, stage],
});

export const withWorkspaceConfig = (
  tenant: string,
  _template: OrchestrationWorkspaceId,
  policy?: OrchestrationPolicy,
): OrchestrationWorkspace => buildWorkspace({ tenant, policy });
