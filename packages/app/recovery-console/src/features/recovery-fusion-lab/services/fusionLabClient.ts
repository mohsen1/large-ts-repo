import {
  createWorkspaceResult,
  runRecoveryFusionLabWorkspace,
  type FusionLabExecutionRequest,
} from '@service/recovery-fusion-lab-orchestrator';

import type { WorkspaceExecutionOptions } from '@service/recovery-fusion-lab-orchestrator';
import { mockLabRequest } from '../mocks';

export const defaultWorkspaceExecutionOptions: WorkspaceExecutionOptions = {
  includeTelemetry: true,
  useTopLevelBootstrap: true,
  pluginNames: ['fusion-lab-plugin:default', 'fusion-lab-plugin:mesh'],
};

export const runDefaultFusionLab = async (
  tenant: string,
  workspace: string,
): Promise<ReturnType<typeof createWorkspaceResult>> => {
  const request = mockLabRequest(tenant, workspace);
  return createWorkspaceResult(request, defaultWorkspaceExecutionOptions);
};

export const executeFusionLab = async (
  request: FusionLabExecutionRequest,
  options: WorkspaceExecutionOptions = defaultWorkspaceExecutionOptions,
) => {
  return runRecoveryFusionLabWorkspace(request, options);
};
