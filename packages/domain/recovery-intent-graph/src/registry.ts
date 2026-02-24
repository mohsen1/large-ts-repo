import {
  createRunId,
  type IntentNodePayload,
  type IntentExecutionContext,
  type IntentExecutionResult,
  type IntentPolicy,
  type IntentRunId,
  type IntentStage,
  type PluginBuckets,
  type PluginContract,
  type PluginResult,
} from './types';

export interface RegistryEvent {
  readonly runId: IntentRunId;
  readonly pluginId: string;
  readonly stage: IntentStage;
  readonly state: 'queued' | 'running' | 'done' | 'failed';
  readonly at: number;
}

export class IntentPluginRegistry<TCatalog extends readonly PluginContract<IntentStage, any, any>[]> {
  readonly #policy: IntentPolicy<TCatalog>;
  readonly #runtime = new Map<IntentStage, PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>();
  readonly #events: RegistryEvent[] = [];

  constructor(policy: IntentPolicy<TCatalog>) {
    this.#policy = policy;
  }

  register<TKind extends IntentStage>(
    plugin: PluginContract<TKind, any, any>,
  ): void {
    const list = this.#runtime.get(plugin.kind) ?? [];
    this.#runtime.set(plugin.kind, [...list, plugin]);
  }

  resolve<TKind extends IntentStage>(kind: TKind): readonly PluginContract<TKind, any, any>[] {
    const builtIn = this.#policy.plugins.filter(
      (plugin): plugin is PluginContract<TKind, any, any> => plugin.kind === kind,
    );
    const plugins = (this.#runtime.get(kind) ?? []).filter(
      (plugin): plugin is PluginContract<TKind, any, any> => plugin.kind === kind,
    );
    return [...plugins, ...builtIn].toSorted((left, right) => right.weight - left.weight) as readonly PluginContract<
      TKind,
      any,
      any
    >[];
  }

  async execute<TKind extends IntentStage>(
    kind: TKind,
    context: IntentExecutionContext,
    attempt = 0,
  ): Promise<IntentExecutionResult> {
    const runId = context.input.runId;
    const selected = this.resolve(kind).at(0);

    this.#events.push({
      runId,
      pluginId: `${kind}:none`,
      stage: kind,
      state: 'queued',
      at: Date.now(),
    });

    using _scope = new RegistryScope(runId, kind);
    if (!selected) {
      this.#events.push({
        runId,
        pluginId: `${kind}:missing`,
        stage: kind,
        state: 'failed',
        at: Date.now(),
      });
      return {
        runId,
        graphId: context.input.graphId,
        tenant: context.input.tenant,
        ok: false,
        confidence: 0,
        recommendations: [`${kind}:missing-plugin`],
      };
    }

    try {
      this.#events.push({
        runId,
        pluginId: String(selected.pluginId),
        stage: kind,
        state: 'running',
        at: Date.now(),
      });
      const result = (await selected.run(context as any)) as PluginResult;
      this.#events.push({
        runId,
        pluginId: String(selected.pluginId),
        stage: kind,
        state: 'done',
        at: Date.now(),
      });

      if (!result.ok) {
        return {
          runId,
          graphId: context.input.graphId,
          tenant: context.input.tenant,
          ok: false,
          confidence: 0,
          recommendations: [result.error.message],
        };
      }

      return {
        runId,
        graphId: context.input.graphId,
        tenant: context.input.tenant,
        ok: true,
        confidence: 0.8,
        recommendations: result.output.recommendations,
      };
    } catch (error) {
      this.#events.push({
        runId,
        pluginId: String(selected.pluginId),
        stage: kind,
        state: 'failed',
        at: Date.now(),
      });

      if (attempt < 1) {
        return this.execute(kind, context, attempt + 1);
      }

      return {
        runId,
        graphId: context.input.graphId,
        tenant: context.input.tenant,
        ok: false,
        confidence: 0,
        recommendations: [`${kind}:failed:${error instanceof Error ? error.message : 'unknown'}`],
      };
    }
  }

  registerFromPolicy(): void {
    for (const plugin of this.#policy.plugins) {
      this.register(plugin);
    }
  }

  get events(): readonly RegistryEvent[] {
    return this.#events;
  }

  inspect(): {
    readonly buckets: PluginBuckets<TCatalog>;
    readonly totalPlugins: number;
    readonly eventCount: number;
  } {
    const buckets = new Map<IntentStage, PluginContract<IntentStage, any, any>[]>();
    for (const [stage, plugins] of this.#runtime.entries()) {
      buckets.set(stage, plugins);
    }

    const mapped = Object.fromEntries([...buckets.entries()].map(([stage, plugins]) => [stage, plugins]));
    return {
      buckets: mapped as unknown as PluginBuckets<TCatalog>,
      totalPlugins: [...this.#runtime.values()].reduce((acc, plugins) => acc + plugins.length, 0),
      eventCount: this.#events.length,
    };
  }
}

export const toBuckets = <TCatalog extends readonly PluginContract<IntentStage, any, any>[]>(
  registry: IntentPluginRegistry<TCatalog>,
): PluginBuckets<TCatalog> => {
  return (registry.inspect().buckets as unknown) as PluginBuckets<TCatalog>;
};

class RegistryScope {
  constructor(
    private readonly runId: IntentRunId,
    private readonly stage: IntentStage,
  ) {}

  [Symbol.dispose](): void {
    void this.runId;
    void this.stage;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}
