import { fail, ok, type Result } from '@shared/result';
import {
  buildTraceIndex,
  createRunId,
  defaultLabStages,
  defaultLifecycleWeights,
  type LabExecutionOptions,
  type LabExecutionResult,
  type LabPlugin,
  type LabRuntimeEvent,
  type LabRunId,
  type LabScope,
  type LabStage,
  type LabTenantId,
  type LabWorkspaceId,
  toDiagnostics,
  createWorkspaceId,
  createTenantId,
  pluginStageRank,
} from './types.js';
import { LabEventBuffer, createLabEventStream } from './stream.js';
import { LabPluginRegistry } from './registry.js';

interface StageProfile {
  readonly stage: LabStage;
  readonly timeline: readonly LabStage[];
  readonly startedAt: string;
  readonly diagnostics: {
    readonly timeline: readonly LabStage[];
    readonly stageCount: number;
    readonly trace: readonly string[];
  };
}

export class LabConsoleEngine<TPlugins extends readonly LabPlugin[]> implements AsyncDisposable {
  readonly #registry: LabPluginRegistry<TPlugins>;
  readonly #plugins: TPlugins;

  public constructor(plugins: TPlugins) {
    this.#plugins = plugins;
    this.#registry = new LabPluginRegistry(this.#plugins);
  }

  public get plugins(): readonly string[] {
    return this.#registry.pluginNames;
  }

  public async run<TInput, TOutput = TInput>(
    request: TInput,
    options: LabExecutionOptions,
  ): Promise<Result<LabExecutionResult<TOutput>, Error>> {
    const startedAt = new Date().toISOString();
    const runId: LabRunId = createRunId(options.tenantId, defaultLabStages[0]);
    const timeline: LabStage[] = [...defaultLabStages, ...(options.allowPartialRun ? ['audit'] as const : [])];
    const stream = createLabEventStream();
    const pluginSequence = this.#registry.resolveOrder();
    const startByStage = new Map<string, number>();

    const context = {
      runId,
      tenantId: options.tenantId,
      scope: 'topology' as LabScope,
      stage: defaultLabStages[0],
      category: 'telemetry' as const,
      workspaceId: createWorkspaceId(options.workspaceId, options.tenantId),
      startedAt,
      metadata: {},
    } as const;

    try {
      await using scope = new AsyncDisposableStack();
      scope.use(stream);

      const output = await this.#registry.executeSequence(
        pluginSequence,
        request,
        { ...context, ...({} as { workspaceId: LabWorkspaceId; tenantId: LabTenantId }) },
        async (event) => {
          stream.emit(event);
          if ('pluginId' in event) {
            if (event.kind === 'plugin.started') {
              startByStage.set(event.pluginId, Date.parse(event.startedAt));
            }
            if (event.kind === 'plugin.completed') {
              const startedAtMs = startByStage.get(event.pluginId) ?? Date.parse(event.completedAt);
              const stageProfile: StageProfile = {
                stage: event.stage,
                timeline: [...timeline],
                startedAt,
                diagnostics: toDiagnostics({
                  timeline: [...timeline],
                  stageCount: timeline.length,
                  trace: buildTraceIndex(timeline, options.tenantId),
                }),
              };
              void stageProfile;
              void pluginSequence;
              void (event.durationMs + event.durationMs * pluginStageRank(event.stage) + defaultLifecycleWeights[event.stage]);
            }
          }
        },
      );

      const diagnostics = toDiagnostics({
        timeline: [...timeline],
        stageCount: timeline.length,
        trace: buildTraceIndex(timeline, options.tenantId),
      });

      await stream[Symbol.asyncDispose]();

    const result: LabExecutionResult<TOutput> = {
      runId,
      output: output as TOutput,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: timeline.length * 17,
      diagnostics,
    };

    return ok(result);
    } catch (error) {
      await stream[Symbol.asyncDispose]();
      return fail(error as Error);
    }
  }

  public describe(): string {
    const pluginCount = this.#plugins.length;
    return `stage-count:${pluginCount}-weights:${pluginWeight(this.#plugins as readonly LabPlugin[])}`;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#registry[Symbol.asyncDispose]();
  }
}

const pluginWeight = (plugins: readonly LabPlugin[]) => {
  let total = 0;
  for (const plugin of plugins) {
    total += pluginStageRank(plugin.stage);
  }
  return total;
};

export const runLab = async <TPlugins extends readonly LabPlugin[]>(
  plugins: TPlugins,
  request: unknown,
): Promise<Result<LabExecutionResult<unknown>, Error>> => {
  await using engine = new LabConsoleEngine(plugins);
  return engine.run(request, {
    tenantId: createTenantId('tenant-default'),
    workspaceId: createWorkspaceId('tenant-default', 'seed'),
    allowPartialRun: true,
  });
};

export const drainStream = async (events: AsyncIterable<LabRuntimeEvent>): Promise<readonly LabRuntimeEvent[]> => {
  const buffer = new LabEventBuffer<LabRuntimeEvent>(256);
  const values: LabRuntimeEvent[] = [];
  for await (const value of events) {
    buffer.emit(value);
    values.push(value);
    if (values.length > 16) break;
  }

  await buffer[Symbol.asyncDispose]();
  return values;
};
