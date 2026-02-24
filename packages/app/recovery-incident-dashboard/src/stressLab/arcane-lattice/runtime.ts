import {
  createAsyncDisposableStack,
  createTraceHandle,
  type TraceHandle,
} from '@shared/recovery-orchestration-runtime';
import {
  createRunId,
  createSessionId,
  createWorkspaceId,
  type ArcaneCatalogKind,
  type ArcaneCatalogMap,
  type ArcaneInputOf,
  type ArcaneOutputOf,
  type ArcanePlugin,
  type ArcanePluginKind,
  type ArcaneWorkspaceAction,
  type ArcaneWorkspaceState,
  inferPluginPayload,
  normalizeWindow,
  pickTopSignals,
  toTelemetryLabel,
  createRunId as makeRunId,
} from './types';
import { createArcaneRegistry, ArcanePluginRegistry } from './registry';
import { type ArcaneAdapter, composeAdapters, mapAdapterTelemetry } from './adapter';

export interface ArcaneRuntimeConfig {
  readonly tenantId: string;
  readonly namespace: string;
  readonly pluginKinds: readonly string[];
  readonly maxWindowMinutes: number;
}

export interface ArcaneRunFrame<TCatalog extends readonly ArcanePlugin[]> {
  readonly workspace: ArcaneWorkspaceState;
  readonly registry: ArcanePluginRegistry<TCatalog>;
  readonly status: ArcaneWorkspaceState['status'];
  readonly activeSession: ReturnType<typeof createSessionId>;
  readonly createdAt: string;
}

export interface ArcaneRuntimeResult<TCatalog extends readonly ArcanePlugin[], TKind extends ArcaneCatalogKind<TCatalog>> {
  readonly workspace: ArcaneWorkspaceState;
  readonly output: readonly ArcaneOutputOf<TCatalog, TKind>[];
  readonly elapsedMs: number;
  readonly trace: TraceHandle;
  readonly timeline: readonly ArcaneWorkspaceAction[];
}

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      from?: <T>(value: Iterable<T>) => { toArray(): T[] };
    };
  }).Iterator;

const toArray = <T>(value: Iterable<T>): readonly T[] => iteratorFrom?.from?.(value)?.toArray() ?? Array.from(value);

class RuntimeSlot implements AsyncDisposable {
  public constructor(readonly id: string, readonly startedAt = new Date().toISOString()) {}
  public [Symbol.asyncDispose](): PromiseLike<void> {
    return Promise.resolve();
  }
  public [Symbol.dispose](): void {}
}

const sortAdapters = (adapters: readonly ArcaneAdapter<any, any, Record<string, unknown>>[]) =>
  [...toArray(adapters)].sort((left, right) => right.weight - left.weight);

const orderedSessionSuffix = (workspace: ArcaneWorkspaceState): string => {
  return `${workspace.runId}:${workspace.workspaceId}`;
};

export const createRuntimeSession = async <TCatalog extends readonly ArcanePlugin[]>(
  config: ArcaneRuntimeConfig,
  catalog: TCatalog,
  workspace: ArcaneWorkspaceState,
): Promise<ArcaneRunFrame<TCatalog>> => {
  const registry = createArcaneRegistry(catalog as readonly ArcanePlugin[]) as unknown as ArcanePluginRegistry<TCatalog>;
  const activeSession = createSessionId(`${config.tenantId}:${config.namespace}:${Date.now()}`);
  return {
    workspace,
    registry,
    status: 'running',
    activeSession,
    createdAt: new Date().toISOString(),
  };
};

export const runArcaneWorkflow = async <
  TCatalog extends readonly ArcanePlugin[],
  TKind extends ArcaneCatalogKind<TCatalog>,
>(
  catalog: TCatalog,
  kind: TKind,
  workspace: ArcaneWorkspaceState,
  adapters: readonly ArcaneAdapter<any, any, Record<string, unknown>>[] = [],
): Promise<ArcaneRuntimeResult<TCatalog, TKind>> => {
  const startedAt = Date.now();
  const runtimeTrace = createTraceHandle(`${workspace.runId}`, String(kind));
  const frame = await createRuntimeSession(
    {
      tenantId: String(workspace.tenantId),
      namespace: String(workspace.namespace),
      pluginKinds: workspace.selectedPluginKinds,
      maxWindowMinutes: normalizeWindow(workspace.config.windowSizeMinutes),
    },
    catalog,
    workspace,
  );

  const stack = createAsyncDisposableStack();
  await using _scope = stack;
  stack.use(new RuntimeSlot(orderedSessionSuffix(frame.workspace)));

  const pipeline = composeAdapters(adapters);
  const timeline: ArcaneWorkspaceAction[] = [];
  const payload = inferPluginPayload(frame.workspace);
  const selectedSignals = pickTopSignals(
    payload.payload.signalIds,
    workspace.config.windowSizeMinutes,
  );

  timeline.push({
    id: `start:${frame.activeSession}`,
    type: 'workspace/start',
    workspaceId: workspace.workspaceId,
    at: new Date().toISOString(),
    tenantId: workspace.tenantId,
    payload: {
      selectedKinds: workspace.selectedPluginKinds.join(','),
      runbookCount: `${payload.runbookIds.length}`,
      windowMinutes: `${workspace.config.windowSizeMinutes}`,
    },
  });

  const outputs = await frame.registry.run(kind, payload as never, workspace, {
    sessionId: frame.activeSession,
    traceToken: frame.activeSession,
    route: 'observe',
  });

  const adapted = await mapAdapterTelemetry('arcane-workflow', outputs, async (rawOutputs) => {
    return pipeline(
      {
        labels: selectedSignals.map(toTelemetryLabel),
        outputs: rawOutputs,
        namespace: frame.workspace.namespace,
      },
      {
        sessionId: frame.activeSession,
        tenantId: workspace.tenantId,
        route: String(workspace.namespace),
      } as never,
    );
  });

  timeline.push({
    id: `pipeline:${frame.activeSession}`,
    type: 'workspace/refresh',
    workspaceId: workspace.workspaceId,
    at: new Date().toISOString(),
    tenantId: workspace.tenantId,
    payload: {
      elapsedMs: `${adapted.metrics.elapsedMs}`,
      outputCount: `${outputs.length}`,
    },
  });

  const nextWorkspace: ArcaneWorkspaceState = {
    ...frame.workspace,
    status: 'ready',
    runId: createRunId(`${frame.workspace.runId}:complete`),
    signalIds: [...frame.workspace.signalIds, ...selectedSignals],
  };

  return {
    workspace: nextWorkspace,
    output: adapted.output as readonly ArcaneOutputOf<TCatalog, TKind>[],
    elapsedMs: Date.now() - startedAt,
    trace: runtimeTrace,
    timeline,
  };
};

export const summarizeRuntimeEvents = (frame: ArcaneRunFrame<readonly ArcanePlugin[]>): readonly string[] =>
  frame.registry.events().map((entry) => `${entry.at} ${entry.pluginId} ${entry.kind} ${entry.status}`);

export const buildTemplateCatalog = (): ArcaneCatalogMap<readonly ArcanePlugin[]> => {
  return {
    predictive: [],
    decision: [],
    playbook: [],
    telemetry: [],
    policy: [],
    signal: [],
  } as ArcaneCatalogMap<readonly ArcanePlugin[]>;
};

export const createWorkspaceRunFrame = (
  tenantId: string,
  catalog: readonly ArcanePlugin[] = [],
): ArcaneRunFrame<typeof catalog> => {
  const workspace = {
    tenantId: `${tenantId}` as ArcaneWorkspaceState['tenantId'],
    workspaceId: createWorkspaceId(`${tenantId}-workspace`),
    namespace: `ns:${tenantId}` as ArcaneWorkspaceState['namespace'],
    runId: makeRunId(`${tenantId}-run`),
    sessionId: createSessionId(`${tenantId}-session`),
    status: 'idle',
    namespaceRoute: `w/${tenantId}`,
    config: {
      tenantId: `${tenantId}` as ArcaneWorkspaceState['tenantId'],
      workspaceId: createWorkspaceId(`${tenantId}-workspace`),
      namespace: `ns:${tenantId}` as ArcaneWorkspaceState['namespace'],
      windowSizeMinutes: 30,
      allowAutoRetry: true,
      includeForecasts: true,
    },
    signalIds: [],
    runbookIds: [],
    selectedPluginKinds: ['predictive', 'decision', 'playbook', 'telemetry', 'policy', 'signal'] as ArcanePluginKind[],
    createdAt: new Date().toISOString(),
  } as ArcaneWorkspaceState;

  return {
    workspace,
    registry: createArcaneRegistry(catalog as readonly ArcanePlugin[]),
    status: 'idle',
    activeSession: createSessionId(`${tenantId}-session`),
    createdAt: new Date().toISOString(),
  };
};
