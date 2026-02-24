import { NoInfer } from '@shared/type-level';
import {
  asTenantId,
  pluginTrace,
  type AnyStreamingPlugin,
  type PluginRunResult,
  type StreamingPluginContext,
  type StreamingPluginKind,
  StreamingPluginRegistry,
  executePluginChain,
} from '@domain/streaming-observability';
import { type StreamLabExecutionTrace, type StreamLabExecutionResult, type StreamLabRequest, type LabRunId, type LabTenantId } from './types';
import { STREAMLAB_CONFIGURATION, STRESS_LAB_PLUGIN_STACK, type StressLabStackInput, type StressLabStackOutput } from './plugin-catalog';

interface PluginTraceState {
  readonly pluginName: string;
  readonly pluginKind: StreamingPluginKind;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly status: StreamLabExecutionTrace['status'];
}

interface ActiveRunContext {
  readonly runId: LabRunId;
  readonly tenantId: LabTenantId;
  readonly streamId: string;
  readonly activePlugins: Set<string>;
  readonly context: StreamingPluginContext;
  readonly traces: PluginTraceState[];
  readonly startedAt: number;
}

type PluginRunTraceRow = Omit<StreamLabExecutionTrace, 'runId'> & {
  readonly runId: LabRunId;
};

export class LabPluginRegistry implements AsyncDisposable, Disposable {
  #closed = false;
  readonly #plugins: typeof STRESS_LAB_PLUGIN_STACK;
  readonly #context: ActiveRunContext;
  readonly #registry: StreamingPluginRegistry<readonly AnyStreamingPlugin[]>;

  constructor(
    plugins: typeof STRESS_LAB_PLUGIN_STACK,
    runId: LabRunId,
    tenantId: LabTenantId,
    streamId: string,
  ) {
    this.#plugins = plugins;
    this.#context = {
      runId,
      tenantId,
      streamId,
      activePlugins: new Set(),
      context: {
        tenant: asTenantId(tenantId),
        streamId,
        traceId: pluginTrace(streamId),
        scope: `policy-plugin:${streamId}`,
        startedAt: new Date().toISOString(),
        metadata: {
          source: 'stream-lab-registry',
          profile: STREAMLAB_CONFIGURATION.channel.profile,
          pluginCount: plugins.length,
        },
      },
      traces: [],
      startedAt: Date.now(),
    };
    this.#registry = new StreamingPluginRegistry(this.#plugins as readonly AnyStreamingPlugin[]);
  }

  get context(): ActiveRunContext {
    return this.#context;
  }

  get names(): readonly string[] {
    return [...this.#registry.pluginNames].sort((left, right) => left.localeCompare(right));
  }

  public async execute(input: NoInfer<StressLabStackInput>): Promise<{
    readonly snapshot: StreamLabExecutionResult;
    readonly chainOutput: StressLabStackOutput;
    readonly traces: readonly StreamLabExecutionTrace[];
  }> {
    const runContext = this.buildContext(input.streamId);
    const startedAt = Date.now();
    const bootstrap = {
      pluginName: 'bootstrap',
      pluginKind: 'ingest-plugin' as StreamingPluginKind,
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs: 0,
      status: 'queued' as const,
    };

    this.#context.activePlugins.add(bootstrap.pluginName);
    this.#context.traces.push({
      pluginName: bootstrap.pluginName,
      pluginKind: bootstrap.pluginKind,
      startedAt: bootstrap.startedAt,
      elapsedMs: 0,
      status: 'running',
    });

    try {
      const chainOutput = await executePluginChain(
        this.#plugins,
        input,
        runContext,
      );

      const recommendations = chainOutput.recommendations
        .toSorted((left, right) => right.confidence - left.confidence)
        .map((entry) => `${entry.runbook}::${entry.confidence.toFixed(3)}`);

      const finalSignals = chainOutput.recommendations
        .slice(0, 3)
        .map((entry, index): StreamLabExecutionResult['finalSignals'][number] => ({
          tenant: asTenantId(this.#context.tenantId),
          streamId: chainOutput.streamId,
          level: entry.confidence > 0.65 ? 'warning' : 'ok',
          score: Number(Math.max(0, 1 - index * 0.12).toFixed(3)),
          details: ['policy', String(entry.runbook)],
          observedAt: `${entry.runbook}-${chainOutput.streamId}`,
        }));

      const snapshot: StreamLabExecutionResult = {
        tenantId: this.#context.tenantId,
        runId: this.#context.runId,
        finalSignals,
        topology: {
          tenantId: input.tenantId,
          nodes: [],
          edges: [],
        },
        trace: this.#context.traces.map(
          (trace): StreamLabExecutionTrace => ({
            runId: this.#context.runId,
            pluginName: trace.pluginName,
            pluginKind: trace.pluginKind,
            startedAt: trace.startedAt,
            elapsedMs: trace.elapsedMs,
            status: trace.status,
          }),
        ),
        recommendations,
      };

      const recommendationRows = chainOutput.recommendations
        .toSorted((left, right) => right.confidence - left.confidence)
        .map((recommendation, index) => ({
          runId: this.#context.runId,
          pluginName: `policy:${recommendation.runbook}` as const,
          pluginKind: 'topology-plugin' as StreamingPluginKind,
          startedAt: new Date(startedAt + 1_000 + index).toISOString(),
          elapsedMs: Math.max(1, 2 + index),
          status: index === 0 ? 'complete' : 'running',
        }) as PluginRunTraceRow);

      return {
        snapshot,
        chainOutput,
        traces: [...snapshot.trace, ...recommendationRows],
      };
    } finally {
      this.#context.activePlugins.delete(bootstrap.pluginName);
      this.#context.traces.length = 0;
    }
  }

  public pluginState(): PluginRunResult<unknown, unknown>[] {
    return this.#registry.state.plugins.map((plugin) => ({
      pluginId: plugin.pluginId,
      input: this.#context.runId,
      output: {
        pluginId: plugin.pluginId,
        streamId: this.#context.streamId,
      },
    }));
  }

  public pluginCount(): number {
    return this.#registry.state.total;
  }

  private buildContext(streamId: string): StreamingPluginContext {
    return {
      tenant: asTenantId(this.#context.tenantId),
      streamId,
      traceId: pluginTrace(streamId),
      scope: `policy-plugin:${streamId}`,
      startedAt: new Date().toISOString(),
      metadata: {
        requestMode: STREAMLAB_CONFIGURATION.channel.profile,
        pluginCount: this.pluginCount(),
      },
    };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }
    this.#closed = true;
    this.#context.activePlugins.clear();
    this.#context.traces.length = 0;
    return this.#registry[Symbol.asyncDispose]();
  }

  public [Symbol.dispose](): void {
    this.#closed = true;
    this.#context.activePlugins.clear();
    this.#context.traces.length = 0;
  }
}

export const createLabRegistry = async (request: StreamLabRequest): Promise<{
  runId: LabRunId;
  pluginNames: readonly string[];
  registry: LabPluginRegistry;
}> => {
  const runId = `${request.tenantId}-${request.streamId}-${request.options.maxExecutionMs}` as LabRunId;
  const registry = new LabPluginRegistry(STRESS_LAB_PLUGIN_STACK, runId, request.tenantId, request.streamId);
  const pluginNames = registry.names;

  return {
    runId,
    pluginNames: pluginNames.length === 0
      ? ['seed-normalizer', 'score-normalizer', 'policy-reco']
      : pluginNames,
    registry,
  };
};

export const withLabRegistry = async <T>(
  request: StreamLabRequest,
  fn: (registry: LabPluginRegistry) => Promise<T>,
): Promise<T> => {
  const holder = await createLabRegistry(request);
  await using registry = holder.registry;
  return fn(registry);
};
