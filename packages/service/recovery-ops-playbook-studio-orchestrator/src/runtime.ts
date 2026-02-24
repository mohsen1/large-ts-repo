import { fail, ok, type Result } from '@shared/result';
import {
  STAGE_ORDER_MAP,
  type PlaybookCatalogEntry,
  type PlaybookCatalogManifest,
  type PlaybookNode,
  type PlaybookExecutionTrace,
  type PluginDiagnostic,
  type PlaybookPluginDefinition,
  type PluginState,
  type PluginTag,
  type RunId,
  type TenantId,
  type WorkspaceId,
} from '@domain/recovery-ops-playbook-studio';
import { PlaybookPluginRegistry } from '@domain/recovery-ops-playbook-studio';
import {
  type StudioRepository,
  InMemoryPlaybookStudioStore,
  buildRunCursor,
  collectTags,
  summarizeRuns,
} from '@data/recovery-ops-playbook-studio-store';
import {
  type OrchestratorConfig,
  type OrchestratorOptions,
  type OrchestratorRequest,
  type OrchestratorResult,
  type OrchestratorSnapshot,
} from './types';

interface StagePlan {
  readonly stages: readonly PluginState[];
  readonly startedAt: string;
  readonly pluginDigest: string;
}

interface RunState {
  status: 'queued' | 'running' | 'complete' | 'errored';
  startedAt: string;
  completedAt?: string;
  request: OrchestratorRequest;
  plan: StagePlan;
  diagnostics: PluginDiagnostic[];
}

type StackCtor = new () => {
  use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type PluginEnvelope = Omit<PlaybookPluginDefinition, 'output'> & {
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
};

const normalizeTenantId = (tenantId: string): TenantId =>
  tenantId.startsWith('tenant:') ? tenantId as TenantId : `tenant:${tenantId}` as TenantId;

const normalizeWorkspaceId = (workspaceId: string): WorkspaceId =>
  workspaceId.startsWith('workspace:') ? workspaceId as WorkspaceId : `workspace:${workspaceId}` as WorkspaceId;

const toPlaybookNodeId = (tenantId: TenantId, workspaceId: WorkspaceId, index: number): PlaybookNode['id'] =>
  `${tenantId}:${workspaceId}:${index}` as PlaybookNode['id'];

const toRunId = (runId: string): RunId => runId as RunId;

const getAsyncStack = (): StackCtor =>
  (globalThis as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack ?? class FallbackAsyncDisposableStack {
    readonly #stack: Array<() => Promise<void>> = [];
    use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T {
      const dispose = value?.[Symbol.asyncDispose];
      if (typeof dispose === 'function') {
        this.#stack.push(() => Promise.resolve(dispose.call(value)));
      }
      return value;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#stack.length > 0) {
        const handle = this.#stack.pop();
        if (handle) {
          await handle();
        }
      }
    }
  };

const defaultOptions: OrchestratorOptions = {
  concurrency: 4,
  retryLimit: 2,
  heartbeatMs: 250,
  autoPersist: true,
};

const makePlugin = (
  entry: PlaybookCatalogEntry,
  namespace: PlaybookCatalogManifest['namespace'],
  orderBase: number,
): PluginEnvelope => {
  const pluginId: PluginTag = entry.key;
  return {
    id: pluginId,
    namespace,
    name: entry.name,
    version: entry.version,
    stage: entry.stage,
    order: orderBase,
    dependencies: [] as readonly PluginTag[],
    input: { labels: [...entry.labels], description: entry.description },
    output: {},
    metadata: { namespace, sourceEntry: entry.key },
    async execute(input, context) {
      return {
        pluginId,
        output: {
          ...input,
          [`${entry.name}`]: {
            stage: entry.stage,
            namespace,
            executedAt: context.now,
          },
        },
        diagnostics: [
          {
            pluginId,
            message: `executed:${entry.name}`,
            severity: entry.stage === 'verify' ? 'warn' : 'info',
            timestamp: context.now,
          },
        ],
      };
    },
    dispose: async () => {
      return Promise.resolve();
    },
  };
};

const parsePluginCatalog = (
  catalog: PlaybookCatalogManifest,
  overrides: readonly PlaybookPluginDefinition[] | undefined,
): readonly PlaybookPluginDefinition[] => {
  if (overrides?.length) return overrides;
  return catalog.entries
    .toSorted((left, right) => STAGE_ORDER_MAP[left.stage] - STAGE_ORDER_MAP[right.stage] || left.priority - right.priority)
    .map((entry, index) => makePlugin(entry, catalog.namespace, index));
};

export class RecoveryOpsPlaybookStudioOrchestrator implements AsyncDisposable {
  readonly #store: StudioRepository;
  readonly #registry: PlaybookPluginRegistry;
  readonly #options: OrchestratorOptions;
  readonly #runs = new Map<RunId, RunState>();

  constructor(
    private readonly config: OrchestratorConfig,
    repository?: StudioRepository,
  ) {
    this.#store = repository ?? new InMemoryPlaybookStudioStore();
    const plugins = parsePluginCatalog(config.catalog, undefined);
    this.#registry = new PlaybookPluginRegistry(plugins, config.catalog);
    this.#options = {
      ...defaultOptions,
      ...config.options,
    };
  }

  async bootstrap(): Promise<Result<void, string>> {
    await this.#store.seedWorkspace({
      tenantId: this.config.tenantId,
      workspaceId: this.config.workspaceId,
      catalog: this.config.catalog,
      nodes: this.config.catalog.entries.map((entry, index) => ({
        id: toPlaybookNodeId(this.config.tenantId, this.config.workspaceId, index),
        name: entry.name,
        phase: entry.stage,
        tags: entry.labels,
      })),
      manifests: new Map(),
      createdAt: new Date().toISOString(),
    });
    return ok(undefined);
  }

  async queueRun(request: OrchestratorRequest): Promise<Result<OrchestratorResult, string>> {
    if (!request.tenantId || !request.workspaceId) return fail('invalid-run-context');
    if (!request.selectedStages.length) return fail('no-stage-selection');

    const runId = `${request.tenantId}::${request.workspaceId}::${Date.now()}` as RunId;
    const plugins = parsePluginCatalog(this.config.catalog, request.plugins);
    const stages = request.selectedStages.toSorted((left, right) => STAGE_ORDER_MAP[left] - STAGE_ORDER_MAP[right]);
    const selectedPlugins = plugins.filter((plugin) => stages.includes(plugin.stage))
      .toSorted((left, right) => left.order - right.order || STAGE_ORDER_MAP[left.stage] - STAGE_ORDER_MAP[right.stage]);

    const plan: StagePlan = {
      stages,
      startedAt: new Date().toISOString(),
      pluginDigest: selectedPlugins.map((plugin) => plugin.id).join('|'),
    };

    const runState: RunState = {
      status: 'queued',
      startedAt: plan.startedAt,
      request: {
        ...request,
        selectedStages: stages,
        plugins: selectedPlugins,
      },
      plan,
      diagnostics: [],
    };
    this.#runs.set(runId, runState);

    const seed = {
      runId,
      tenantId: normalizeTenantId(request.tenantId),
      workspaceId: normalizeWorkspaceId(request.workspaceId),
      payload: { ...request.input, catalogEntries: selectedPlugins.length },
      startedAt: runState.startedAt,
      updatedAt: runState.startedAt,
      status: 'idle' as const,
    };
    const saved = await this.#store.saveRun(seed);
    if (!saved.ok) return fail(saved.error);

    return this.executeRun(runId, selectedPlugins);
  }

  async executeRun(
    runId: RunId,
    selectedPlugins: readonly PlaybookPluginDefinition[],
  ): Promise<Result<OrchestratorResult, string>> {
    const runState = this.#runs.get(runId);
    if (!runState) return fail('run-not-found');
    runState.status = 'running';

    const AsyncStack = getAsyncStack();
    await using _stack = new AsyncStack();
    const start = Date.now();
    let payload = runState.request.input as Record<string, unknown>;
    const traceLines: PluginDiagnostic[] = [];
    const pluginOrder: PluginTag[] = [];

    for (const plugin of selectedPlugins) {
      const result = await this.#registry.resolve<Record<string, unknown>, Record<string, unknown>>(
        plugin.id,
        payload,
        {
          tenantId: runState.request.tenantId,
          workspaceId: runState.request.workspaceId,
          runId,
        },
      );

      if (!result.ok) {
        runState.status = 'errored';
        runState.completedAt = new Date().toISOString();
        runState.diagnostics.push({
          pluginId: plugin.id,
          message: `plugin-failed:${plugin.name}:${result.error}`,
          severity: 'error',
          timestamp: new Date().toISOString(),
        });
        return fail(result.error);
      }

      payload = { ...payload, ...result.value };
      pluginOrder.push(plugin.id);
      runState.diagnostics.push({
        pluginId: plugin.id,
        message: `plugin-complete:${plugin.name}`,
        severity: 'info',
        timestamp: new Date().toISOString(),
      });
      traceLines.push(...runState.diagnostics);
      this.config.progress?.('plugin-completed', { runId, pluginId: plugin.id, stage: plugin.stage });
      await plugin.dispose?.();
    }

    const trace: PlaybookExecutionTrace = {
      runId,
      pluginOrder,
      totals: {
        elapsedMs: Date.now() - start,
        errorCount: traceLines.filter((entry) => entry.severity === 'error').length,
        warningCount: traceLines.filter((entry) => entry.severity === 'warn').length,
      },
    };
    await this.#store.saveTrace(trace);
    const recentRuns = await this.#store.listRuns({
      tenantId: normalizeTenantId(runState.request.tenantId),
      workspaceId: normalizeWorkspaceId(runState.request.workspaceId),
    });
    const tagsSource = recentRuns.ok ? recentRuns.value : [];
    await this.#store.saveArtifacts(runId, [
      {
        id: `${runId}:artifact`,
        runId,
        name: `${runState.request.context.operator}:artifact`,
        payload: {
          tags: collectTags(tagsSource),
          stageDigest: runState.plan.pluginDigest,
        },
        createdAt: new Date().toISOString(),
      },
    ]);

    const complete = await this.#store.saveRun({
      runId,
      tenantId: normalizeTenantId(runState.request.tenantId),
      workspaceId: normalizeWorkspaceId(runState.request.workspaceId),
      payload,
      startedAt: runState.startedAt,
      updatedAt: new Date().toISOString(),
      status: 'succeeded',
    });
    if (!complete.ok) {
      return fail(complete.error);
    }

    runState.status = 'complete';
    runState.completedAt = new Date().toISOString();
    return ok({
      runId,
      status: runState.status,
      artifactCount: 1,
      diagnostics: runState.diagnostics.map((entry) => `${entry.pluginId}:${entry.severity}:${entry.message}`),
      trace,
    });
  }

  async listRuns(query: {
    tenantId?: string;
    workspaceId?: string;
  } = {}): Promise<Result<readonly string[], string>> {
    const runs = await this.#store.listRuns({
      tenantId: query.tenantId ? normalizeTenantId(query.tenantId) : undefined,
      workspaceId: query.workspaceId ? normalizeWorkspaceId(query.workspaceId) : undefined,
      includeArchived: true,
    });
    if (!runs.ok) return fail(runs.error);

    const cursors = runs.value
      .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((run) => buildRunCursor(run));
    const summary = summarizeRuns(runs.value);
    return ok([...cursors, `active:${summary.active}`, `failed:${summary.failed}`]);
  }

  async inspect(runId: string): Promise<Result<OrchestratorSnapshot, string>> {
    const lookup = toRunId(runId);
    const runState = this.#runs.get(lookup);
    if (!runState) return fail('run-not-found');

    const runs = await this.#store.listRuns({
      tenantId: normalizeTenantId(runState.request.tenantId),
      workspaceId: normalizeWorkspaceId(runState.request.workspaceId),
      includeArchived: true,
    });
    if (!runs.ok) return fail(runs.error);

    const summary = summarizeRuns(runs.value);
    return ok({
      tenantId: normalizeTenantId(runState.request.tenantId),
      workspaceId: normalizeWorkspaceId(runState.request.workspaceId),
      catalog: this.config.catalog,
      activeRunCount: summary.active,
      completeRunCount: summary.total - summary.failed,
    });
  }

  async runDiagnostics(runId: string): Promise<Result<readonly string[], string>> {
    const tracesRunId = toRunId(runId);
    const streams = await this.#store.streamTraces(tracesRunId);
    if (!streams.ok) return fail(streams.error);
    const diagnostics: string[] = [];
    for await (const trace of streams.value) {
      diagnostics.push(`run:${trace.runId}`);
      diagnostics.push(...trace.pluginOrder.map((pluginId) => `plugin:${pluginId}`));
    }
    return ok(diagnostics);
  }

  async abort(runId: string): Promise<Result<boolean, string>> {
    const abortRunId = toRunId(runId);
    const state = this.#runs.get(abortRunId);
    if (!state) return fail('run-not-found');
    state.status = 'errored';
    state.completedAt = new Date().toISOString();
    return ok(true);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#store[Symbol.asyncDispose]();
    this.#runs.clear();
  }
}

export const createOrchestrator = (
  config: OrchestratorConfig,
  repository?: StudioRepository,
): RecoveryOpsPlaybookStudioOrchestrator =>
  new RecoveryOpsPlaybookStudioOrchestrator(config, repository);

export const buildRunFingerprint = (runId: string): string =>
  `${runId}:${runId.length}:${new Date().toISOString()}`;
