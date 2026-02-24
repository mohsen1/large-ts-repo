import { NoInfer } from '@shared/type-level';
import {
  AnyStreamingCommandPlugin,
  CommandExecutionContext,
  CommandNamespace,
  CommandPlan,
  CommandPlanStepDescriptor,
  CommandRunResult,
  asCommandResultId,
  asCommandTag,
  PluginIndex,
  RecursiveTuple,
  StreamingCommandPlugin,
  StepPair,
} from './types';

interface AsyncStackLike {
  use<T extends Disposable | AsyncDisposable>(resource: T): T;
  [Symbol.asyncDispose](): Promise<void>;
}

interface AsyncStackCtor {
  new (): AsyncStackLike;
}

const resolveStackCtor = (): AsyncStackCtor => {
  const Candidate = (globalThis as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (Candidate) return Candidate;
  return class FallbackStack implements AsyncStackLike {
    private readonly disposers: Array<() => Promise<void> | void> = [];
    use<T>(resource: T): T {
      return resource;
    }
    adopt<T>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.disposers.push(() => onDispose(resource));
      return resource;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
        await this.disposers[index]?.();
      }
    }
  };
};

const AsyncStack = resolveStackCtor();

type NamespaceBucket = Set<string>;

export interface PluginRegistryEvent {
  readonly kind: CommandNamespace;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly timestamp: string;
}

export interface RegistryRunResult<TOutput = unknown> {
  readonly output: TOutput;
  readonly warnings: readonly string[];
  readonly tags: readonly string[];
  readonly score: number;
}

const buildFallbackPlugin = (
  descriptor: CommandPlanStepDescriptor,
): StreamingCommandPlugin<string, any, unknown, unknown> => {
  return {
    ...descriptor,
    run: async (input: unknown, context: CommandExecutionContext): Promise<unknown> => {
      const record = typeof input === 'object' && input !== null ? input : {};
      return {
        ...(record as Record<string, unknown>),
        pluginKind: descriptor.kind,
        pluginName: descriptor.name,
        stepId: descriptor.stepId,
        context,
      };
    },
  };
};

export class StreamingCommandPluginRegistry<TCatalog extends readonly AnyStreamingCommandPlugin[]> {
  private readonly catalog = new Map<string, AnyStreamingCommandPlugin>();
  private readonly byNamespace: Partial<Record<CommandNamespace, NamespaceBucket>> = {};
  private readonly registries: PluginRegistryEvent[] = [];
  private readonly disposers = new Map<string, () => void>();
  private closed = false;

  public constructor(plugins: TCatalog = [] as unknown as TCatalog) {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  public get state(): PluginIndex<TCatalog> {
    return [...this.catalog.values()].reduce(
      (acc, plugin) => {
        const key = `plugin:${plugin.kind}:${plugin.name}` as keyof PluginIndex<TCatalog>;
        (acc[key] as TCatalog[number] | undefined) = plugin;
        return acc;
      },
      {} as PluginIndex<TCatalog>,
    );
  }

  public get byName(): readonly TCatalog[number][] {
    return [...this.catalog.values()] as TCatalog[number][];
  }

  public namespaceSnapshot(): Readonly<Record<CommandNamespace, readonly string[]>> {
    return Object.fromEntries(
      Object.entries(this.byNamespace).map(([namespace, bucket]) => [
        namespace,
        [...(bucket ?? new Set<string>())].sort(),
      ]),
    ) as unknown as Readonly<Record<CommandNamespace, readonly string[]>>;
  }

  public byKind(namespace: CommandNamespace): readonly TCatalog[number][] {
    const ids = this.byNamespace[namespace] ?? new Set<string>();
    return [...ids]
      .map((id) => this.catalog.get(id))
      .filter((plugin): plugin is TCatalog[number] => plugin !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public getPlugin<T extends AnyStreamingCommandPlugin>(kind: T['kind'], namespace: CommandNamespace): T | undefined {
    const bucket = this.byNamespace[namespace];
    if (!bucket) return undefined;
    for (const pluginId of bucket) {
      const candidate = this.catalog.get(pluginId);
      if (!candidate) continue;
      if (candidate.kind === kind) return candidate as T;
    }
    return undefined;
  }

  public register<TPlugin extends AnyStreamingCommandPlugin>(plugin: NoInfer<TPlugin>): this {
    if (this.closed) return this;
    if (this.catalog.has(plugin.pluginId)) return this;

    const namespaceBucket = this.byNamespace[plugin.namespace] ?? new Set<string>();
    namespaceBucket.add(plugin.pluginId);
    this.byNamespace[plugin.namespace] = namespaceBucket;
    this.catalog.set(plugin.pluginId, plugin);

    this.disposers.set(plugin.pluginId, () => {
      const bucket = this.byNamespace[plugin.namespace];
      bucket?.delete(plugin.pluginId);
      if (bucket?.size === 0) {
        delete this.byNamespace[plugin.namespace];
      }
      this.catalog.delete(plugin.pluginId);
      this.registries.push({
        kind: plugin.namespace,
        pluginId: plugin.pluginId,
        pluginName: plugin.name,
        timestamp: new Date().toISOString(),
      });
    });

    return this;
  }

  public unregister(pluginId: string): void {
    const disposer = this.disposers.get(pluginId);
    if (!disposer) return;
    disposer();
    this.disposers.delete(pluginId);
  }

  public async runPlan<TSeed, TOutput>(
    plan: CommandPlan,
    seed: NoInfer<TSeed>,
    context: Omit<CommandExecutionContext, 'attempt'>,
  ): Promise<CommandRunResult<TOutput>> {
    const stackCtor = new AsyncStack();
    const warnings: string[] = [];
    const tags: string[] = [];
    const startedAt = Date.now();
    let payload: unknown = seed as unknown;
    const descriptors = plan.plugins as readonly CommandPlanStepDescriptor[];

    try {
      for (const descriptor of descriptors) {
        const plugin = this.resolvePlugin(descriptor);
        const pluginContext = {
          ...context,
          pluginName: descriptor.name,
          attempt: 1,
        } as CommandExecutionContext;
        stackCtor.use({
          [Symbol.asyncDispose]() {
            return Promise.resolve();
          },
        } as AsyncDisposable);

        const output = await plugin.run(payload, pluginContext);
        payload = output;
        tags.push(asCommandTag(`step.${descriptor.stepId}`));
      }

      return {
        status: warnings.length === 0 ? 'succeeded' : 'running',
        traceId: context.traceId,
        resultId: asCommandResultId(`${context.runId}:${Date.now()}`),
        streamId: context.streamId,
        output: payload as TOutput,
        score: {
          score: Number(Math.max(0, 1 - Math.min(1, warnings.length * 0.04)).toFixed(3)),
          confidence: 0.9,
          severity: (warnings.length >= 3 ? 4 : warnings.length >= 1 ? 2 : 1) as 1 | 2 | 3 | 4 | 5,
        },
        warnings,
        tags: tags as CommandRunResult<TOutput>['tags'],
      };
    } finally {
      await stackCtor[Symbol.asyncDispose]();
      const elapsed = Date.now() - startedAt;
      tags.push(asCommandTag(`duration:${elapsed}`));
    }
  }

  public resolvePlugin(
    descriptor: CommandPlanStepDescriptor,
  ): StreamingCommandPlugin<string, any, unknown, unknown> {
    return (
      this.getPlugin(descriptor.kind, descriptor.namespace) as StreamingCommandPlugin<
        string,
        any,
        unknown,
        unknown
      >
      ?? buildFallbackPlugin(descriptor)
    );
  }

  public eventsSince(timestamp = 0): readonly PluginRegistryEvent[] {
    if (timestamp === 0) {
      return [...this.registries];
    }
    return this.registries.filter((event) => Date.parse(event.timestamp) > timestamp);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const pluginId of [...this.disposers.keys()]) {
      this.unregister(pluginId);
    }
  }

  public [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

export const toStepMap = <TPlan extends readonly CommandPlanStepDescriptor[]>(
  plan: TPlan,
): StepPair<Readonly<AnyStreamingCommandPlugin[]>> => {
  const entries = plan.map((plugin) => [
    `step:${plugin.kind}` as keyof StepPair<Readonly<AnyStreamingCommandPlugin[]>>,
    ((input: unknown) => Promise.resolve({
      pluginId: plugin.pluginId,
      pluginName: plugin.name,
      output: input,
    })) as StepPair<Readonly<AnyStreamingCommandPlugin[]>>[keyof StepPair<Readonly<AnyStreamingCommandPlugin[]>>],
  ]);
  return Object.fromEntries(entries) as StepPair<Readonly<AnyStreamingCommandPlugin[]>>;
};

export const flattenTuples = <TValues extends readonly [unknown, unknown, unknown]>(
  ...values: TValues
): RecursiveTuple<unknown, 3> => [values[0], values[1], values[2]] as RecursiveTuple<unknown, 3>;
