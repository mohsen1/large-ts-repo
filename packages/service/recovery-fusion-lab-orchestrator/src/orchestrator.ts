import { createWorkspaceSeed, buildAdapterFrames, createTimelineDigest } from './runtime';
import {
  runFramesToRecords,
  runWorkspace,
  toWorkspaceResult,
} from './lab-run';
import { fail, ok, type Result } from '@shared/result';
import { asLabRunId } from '@domain/recovery-fusion-lab-core';
import { filterAdapters } from './adapter';
import type {
  FusionLabExecutionRequest,
  FusionLabExecutionResult,
  FusionLabWorkspace,
  WorkspaceExecutionOptions,
  WorkspaceResult,
} from './types';

export interface FusionLabWorkspaceOrchestratorConfig {
  readonly options: WorkspaceExecutionOptions;
  readonly request: FusionLabExecutionRequest;
}

type WorkspaceState = {
  readonly startedAt: string;
  readonly active: boolean;
  readonly requests: number;
};

type AdapterList = ReturnType<typeof filterAdapters>;

class WorkspaceScope implements AsyncDisposable {
  readonly #adapters: AdapterList;
  readonly #stack: AsyncDisposableStack;
  #disposed = false;
  readonly #request: FusionLabExecutionRequest;
  #state: WorkspaceState;

  private constructor(request: FusionLabExecutionRequest, adapters: AdapterList) {
    this.#request = request;
    this.#adapters = adapters;
    this.#stack = new AsyncDisposableStack();
    this.#state = {
      startedAt: new Date().toISOString(),
      active: true,
      requests: 1,
    };
  }

  static async create(
    request: FusionLabExecutionRequest,
    options: WorkspaceExecutionOptions,
  ): Promise<WorkspaceScope> {
    const adapters = filterAdapters(options, request);
    return new WorkspaceScope(request, adapters);
  }

  get request(): FusionLabExecutionRequest {
    return this.#request;
  }

  get state(): WorkspaceState {
    return this.#state;
  }

  markInactive(): void {
    this.#state = {
      ...this.#state,
      active: false,
      requests: this.#state.requests + 1,
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#stack.disposeAsync();
    for (const adapter of this.#adapters) {
      await adapter.dispose?.();
    }
  }
}

const defaultRunOptions: WorkspaceExecutionOptions = {
  includeTelemetry: true,
  useTopLevelBootstrap: true,
  pluginNames: ['fusion-lab-plugin:default'],
};

const bootstrapOptions = async (): Promise<WorkspaceExecutionOptions> => {
  const seed = createWorkspaceSeed({
    tenant: 'tenant:default',
    workspace: 'workspace:auto',
    requestedBy: 'orchestrator',
  });

  return seed.accepted ? defaultRunOptions : {
    ...defaultRunOptions,
    pluginNames: [],
  };
};

export const runRecoveryFusionLabWorkspace = async (
  request: FusionLabExecutionRequest,
  options?: WorkspaceExecutionOptions,
): Promise<Result<FusionLabExecutionResult, Error>> => {
  const resolvedOptions = options ?? (await bootstrapOptions());
  await using scope = await WorkspaceScope.create(request, resolvedOptions);

  const timeline: string[] = [];
  for await (const event of runFramesToRecords(request)) {
    timeline.push(event);
  }

  const adapters = filterAdapters(resolvedOptions, request);
  const adapterFrames = buildAdapterFrames(adapters, request);
  const digest = createTimelineDigest(adapterFrames.concat(timeline));

  const result = await runWorkspace(request);
  scope.markInactive();

  if (!result) {
    return fail(new Error(`workspace execution failed for ${request.workspaceId}`));
  }

  return ok({
    ...result,
    status: timeline.length > 0 ? 'completed' : 'failed',
    traceDigest: `${digest}::adapters:${adapterFrames.length}`,
  });
};

export const createWorkspaceResult = async (
  request: FusionLabExecutionRequest,
  options?: WorkspaceExecutionOptions,
): Promise<WorkspaceResult<FusionLabExecutionRequest>> => {
  const resolvedOptions = options ?? (await bootstrapOptions());
  const run = await runRecoveryFusionLabWorkspace(request, resolvedOptions);
  if (!run.ok) {
    return fail(run.error);
  }

  const trace: { at: string; event: 'fusion-lab.plan'; phase: 'plan' }[] = [];
  for await (const _ of runFramesToRecords(request)) {
    const entry = {
      at: new Date().toISOString(),
      event: 'fusion-lab.plan' as const,
      phase: 'plan' as const,
    };
    trace.push(entry);
  }

  const workspace: FusionLabWorkspace = toWorkspaceResult(
    request,
    {
      workspaceId: request.workspaceId,
      tenantId: request.tenantId,
      mode: request.mode,
      maxParallelism: request.topology.nodes.length + request.topology.edges.length,
      traceLevel: request.traceLevel,
    },
    run.value,
  );

  return ok({
    workspace,
    plan: {
      runId: asLabRunId(`${request.workspaceId}#plan`),
      createdAt: new Date().toISOString(),
      waves: run.value.waves,
      signals: run.value.signals,
      commands: run.value.commands,
    },
    frames: trace,
  });
};
