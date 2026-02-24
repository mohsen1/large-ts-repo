import { err, ok, type Result } from '@shared/result';
import type {
  HorizonSignal,
  HorizonPlan,
  JsonLike,
  PluginStage,
} from '@domain/recovery-horizon-engine';
import {
  asWorkspaceId,
  createStudioService,
  createWorkspaceIntent,
  type CreateWorkspaceInput,
  type WorkspaceServiceFailure,
  type WorkspaceServiceResult,
} from '@domain/recovery-horizon-studio-core';

type RunStatus = 'pending' | 'running' | 'stopped' | 'failed';

export interface HorizonStudioStatus {
  readonly workspaceId: string;
  readonly plans: readonly HorizonPlan[];
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly runStatus: RunStatus;
}

export interface HorizonStudioRunResult {
  readonly started: boolean;
  readonly payload: HorizonStudioStatus;
}

const service = createStudioService();

const formatStatus = (value: Result<WorkspaceServiceResult, WorkspaceServiceFailure>): HorizonStudioStatus =>
  value.ok
    ? {
        workspaceId: String(value.value.workspace.workspaceId),
        plans: value.value.workspace.plans,
        signals: value.value.workspace.signals,
        runStatus: value.value.state.active ? 'running' : 'stopped',
      }
    : {
        workspaceId: 'none',
        plans: [],
        signals: [],
        runStatus: 'failed',
      };

export const startStudioRun = async (input: CreateWorkspaceInput): Promise<HorizonStudioRunResult> => {
  const response = await service.start(input);
  return response.ok
    ? {
        started: true,
        payload: formatStatus(response),
      }
    : {
        started: false,
        payload: {
          workspaceId: 'none',
          plans: [],
          signals: [],
          runStatus: 'failed',
        },
      };
};

export const stopStudioRun = async (workspaceId: string): Promise<boolean> => {
  return service.stop(asWorkspaceId(workspaceId));
};

export const runStatus = async (workspaceId: string): Promise<{
  readonly healthy: boolean;
  readonly workspaces: readonly string[];
}> => {
  const workspaces = await service.health();
  return {
    healthy: workspaces.includes(workspaceId),
    workspaces,
  };
};

export const executeStudioWorkflow = async (
  tenantId: string,
  owner: string,
): Promise<Result<WorkspaceServiceResult, WorkspaceServiceFailure>> => {
  const response = await service.start({
    tenantId,
    owner,
    tags: ['workflow', 'api'],
  });
  if (!response.ok) {
    return err(response.error);
  }

  const intent = createWorkspaceIntent({
    tenantId,
    owner,
    tags: ['workflow', 'api'],
  });

  return ok({
    ok: true,
    state: response.value.state,
    workspace: {
      ...response.value.workspace,
      intent: {
        ...response.value.workspace.intent,
        runLabel: intent.runLabel,
      },
    },
  });
};

export const buildWorkspaceIntent = (tenantId: string, owner: string): CreateWorkspaceInput => ({
  tenantId,
  owner,
  tags: ['horizon-studio', `tenant=${tenantId}`, `owner=${owner}`],
});
