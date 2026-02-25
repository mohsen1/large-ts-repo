import { createSharedRegistry, type FaultIntelPlugin, type PluginContext, type PluginInvocation, type Brand } from '@shared/fault-intel-runtime';
import { fail, ok, type Result } from '@shared/result';

type StageToken = 'seed' | 'normalize' | 'score' | 'audit' | 'finalize';
type PluginStage = `fault-intel-stage:${StageToken}`;
type PluginByStage<TStage extends StageToken = StageToken> = `${TStage}:${string}`;
type PipelinePluginId = Brand<string, 'FaultIntelPluginId'>;
type PipelinePluginStage = Brand<string, 'FaultIntelStage'>;

export type PipelineResult<TSeed, TPlugins extends readonly PipelinePlugin<any, any>[]> = TSeed;

type PluginRegistryMap<TPlugins extends readonly PipelinePlugin<any, any>[]> = Record<
  string,
  PipelinePlugin<any, any>
>;

interface PipelineStackLike {
  use<TResource>(resource: TResource): TResource;
  [Symbol.asyncDispose](): Promise<void>;
}

class FallbackAsyncDisposableStack implements PipelineStackLike {
  #resources: Array<{ [Symbol.asyncDispose](): PromiseLike<void> }> = [];

  use<TResource>(resource: TResource): TResource {
    this.#resources.push(resource as { [Symbol.asyncDispose](): PromiseLike<void> });
    return resource;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const resource of this.#resources.reverse()) {
      await resource[Symbol.asyncDispose]();
    }
    this.#resources = [];
  }
}

interface PluginExecutionResult<TSeed> {
  readonly diagnostics: readonly PluginInvocation<PluginContext, TSeed, unknown>[];
  readonly output: TSeed;
}

const AsyncStackCtor = (globalThis as { AsyncDisposableStack?: new () => PipelineStackLike }).AsyncDisposableStack;

export interface PipelinePlugin<TInput, TOutput> extends FaultIntelPlugin<
  PluginContext,
  TInput,
  TOutput,
  { readonly stage: PluginStage }
> {
  readonly pipelineId: PluginByStage;
  readonly tags: readonly string[];
}

export interface PipelineRuntimeOptions {
  readonly namespace: string;
  readonly maxParallel?: number;
  readonly allowFallback?: boolean;
}

export class CampaignPluginStack<TPlugins extends readonly PipelinePlugin<any, any>[]> {
  private readonly namespace: string;
  private readonly registry = createSharedRegistry<PluginContext>();
  private readonly pluginRecords: Map<string, PipelinePlugin<unknown, unknown>>;

  public constructor(
    private readonly plugins: TPlugins,
    options: PipelineRuntimeOptions,
  ) {
    this.namespace = options.namespace;
    this.pluginRecords = new Map(
      options.allowFallback === false
        ? []
        : plugins.map((plugin) => [plugin.id as string, plugin as PipelinePlugin<unknown, unknown>]),
    );
  }

  public async register<TPlugin extends PipelinePlugin<any, any>>(plugin: TPlugin): Promise<Result<TPlugin, string>> {
    const typed = plugin as PipelinePlugin<unknown, unknown>;
    this.pluginRecords.set(String(typed.id), typed);
    this.registry.register(typed, this.namespace);
    return ok(plugin);
  }

  public async execute<TSeed, TResult = PipelineResult<TSeed, TPlugins>>(
    seed: TSeed,
    context: PluginContext,
    filters?: { readonly capability?: string; readonly minPriority?: number; readonly maxPriority?: number },
  ): Promise<Result<TResult, string>> {
    const stackType = AsyncStackCtor ?? FallbackAsyncDisposableStack;
    await using _scope = new stackType();

    const entries = [...this.pluginRecords.values()] as PipelinePlugin<unknown, unknown>[];
    if (entries.length === 0) {
      return ok(seed as unknown as TResult);
    }

    entries.forEach((plugin) => {
      const registration = this.registry.register(plugin, this.namespace);
      _scope.use(registration.scope);
    });

    const pipeline = await this.registry.executePipeline(this.namespace, seed as TSeed, context, {
      capability: filters?.capability,
      minPriority: filters?.minPriority,
      maxPriority: filters?.maxPriority,
    });

    const executionResult = {
      output: pipeline.value,
      diagnostics: pipeline.diagnostics as PluginInvocation<PluginContext, TSeed, unknown>[],
    } as PluginExecutionResult<TSeed>;

    return ok(executionResult.output as unknown as TResult);
  }

  public summary(): {
    readonly keys: readonly string[];
    readonly staged: readonly string[];
  } {
    return {
      keys: Object.keys(this.pluginRecords),
      staged: Array.from(this.pluginRecords.keys()),
    };
  }

  public asRecord(): PluginRegistryMap<TPlugins> {
    const out = {} as PluginRegistryMap<TPlugins>;
    for (const [id, plugin] of this.pluginRecords.entries()) {
      (out as Record<string, PipelinePlugin<any, any>>)[id] = plugin;
    }
    return out;
  }
}

const asPluginId = (value: string): PipelinePluginId => value as unknown as PipelinePluginId;
const asPluginStage = (value: string): PipelinePluginStage => value as unknown as PipelinePluginStage;

export const buildSeedPlugin = (
  priority: number,
): PipelinePlugin<readonly string[], readonly string[]> => ({
  id: asPluginId(`seed:${priority}`),
  stage: asPluginStage('fault-intel-stage:seed'),
  priority,
  supports: ['seed'],
  config: {
    stage: 'fault-intel-stage:seed' as const,
  },
  pipelineId: `seed:${priority}` as PluginByStage<'seed'>,
  tags: ['seed', 'bootstrap'],
  configure(context) {
    return {
      ...context,
      tags: new Set([...context.tags, ...this.tags]),
    };
  },
  execute(context, input) {
    void context;
    return [...new Set(input)] as readonly string[];
  },
});

export const buildNormalizePlugin = (
  id: string,
): PipelinePlugin<readonly string[], readonly string[]> => ({
  id: asPluginId(`normalize:${id}`),
  stage: asPluginStage('fault-intel-stage:normalize'),
  priority: 2,
  supports: ['normalize'],
  config: { stage: 'fault-intel-stage:normalize' as const },
  pipelineId: `normalize:${id}` as PluginByStage<'normalize'>,
  tags: ['normalize', id],
  configure(context) {
    return {
      ...context,
      tags: new Set([...context.tags, ...this.tags]),
    };
  },
  execute(context, input) {
    void context;
    const deduped = [...new Set(input)] as readonly string[];
    return deduped;
  },
});

export const buildScoringPlugin = (): PipelinePlugin<readonly string[], number> => ({
  id: asPluginId('score:default'),
  stage: asPluginStage('fault-intel-stage:score'),
  priority: 3,
  supports: ['score'],
  config: { stage: 'fault-intel-stage:score' as const },
  pipelineId: 'score:default' as PluginByStage<'score'>,
  tags: ['score'],
  configure(context) {
    return {
      ...context,
      tags: new Set([...context.tags, ...this.tags]),
    };
  },
  execute(context, input) {
    void context;
    return input.length;
  },
});

const seededPlugins = [buildSeedPlugin(1), buildNormalizePlugin('default'), buildScoringPlugin()] as const;

export const createDefaultPluginStack = (namespace = 'fault-intel-advanced'): CampaignPluginStack<readonly PipelinePlugin<any, any>[]> => {
  return new CampaignPluginStack([...seededPlugins], {
    namespace,
    maxParallel: 1,
    allowFallback: true,
  });
};
