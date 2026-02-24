import type { Brand } from '@shared/type-level';

export type NoInfer<T> = [T][T extends never ? never : 0];

export type PluginStage = 'discover' | 'score' | 'simulate' | 'execute' | 'verify' | 'report';
export type PluginResultStatus = 'ok' | 'warn' | 'fail';

export type PluginName<Name extends string> = Brand<`lab-plugin:${Name}`, 'PluginName'>;
export type PluginRunId = Brand<string, 'PluginRunId'>;

export interface PluginExecutionEvent<TContext = object, TInput = object> {
  readonly plugin: PluginName<string>;
  readonly input: TInput;
  readonly context: TContext;
  readonly phase: PluginStage;
  readonly runId: PluginRunId;
  readonly startedAt: string;
}

export interface PluginExecutionTrace {
  readonly stage: PluginStage;
  readonly plugin: PluginName<string>;
  readonly status: PluginResultStatus;
  readonly elapsedMs: number;
  readonly notes: readonly string[];
}

export interface PluginResult<TOutput = object> {
  readonly output: TOutput;
  readonly trace: PluginExecutionTrace;
}

export interface LabPluginDescriptor<
  TInput extends object = object,
  TOutput extends object = object,
  TContext extends object = object,
  TConfig extends object = object,
> {
  readonly id: PluginName<string>;
  readonly label: string;
  readonly version: `${number}.${number}.${number}`;
  readonly supportedPhases: readonly PluginStage[];
  readonly config: TConfig;
  readonly execute: (event: PluginExecutionEvent<TContext, TInput>) => Promise<PluginResult<TOutput>>;
  readonly teardown?: (output: PluginResult<TOutput>, context: TContext) => Promise<void>;
}

export interface PluginLease {
  readonly pluginId: PluginName<string>;
  [Symbol.dispose](): void;
}

export interface PluginRegistrationRecord<TConfig extends object = object> {
  readonly id: PluginName<string>;
  readonly config: TConfig;
  readonly registeredAt: string;
}

const withPluginTrace = (
  plugin: PluginName<string>,
  phase: PluginStage,
  startedAt: string,
  elapsedMs: number,
  status: PluginResultStatus,
): PluginExecutionTrace => ({
  stage: phase,
  plugin,
  status,
  elapsedMs,
  notes: [
    `phase:${phase}`,
    `started:${startedAt}`,
    `elapsedMs:${elapsedMs}`,
  ],
});

export const createPluginId = (value: string): PluginName<string> => value as PluginName<string>;

const makeRegistryBucket = () => new Map<PluginStage, LabPluginDescriptor<object, object, object, object>[]>();

export class PluginRegistry<TPlugins extends readonly LabPluginDescriptor<object, object, object, object>[]> {
  private readonly plugins: TPlugins;
  private readonly registered = new Map<string, PluginRegistrationRecord>();
  private readonly byPhase = makeRegistryBucket();

  constructor(plugins: TPlugins) {
    this.plugins = plugins;
    for (const plugin of plugins) {
      this.registered.set(String(plugin.id), {
        id: plugin.id,
        config: plugin.config,
        registeredAt: new Date().toISOString(),
      });

      for (const phase of plugin.supportedPhases) {
        const bucket = this.byPhase.get(phase) ?? [];
        bucket.push(plugin);
        this.byPhase.set(phase, bucket);
      }
    }
  }

  candidatesForPhase<TContext extends object>(phase: PluginStage): readonly LabPluginDescriptor<object, object, TContext, object>[] {
    return (this.byPhase.get(phase) ?? []).map((entry) => entry as LabPluginDescriptor<object, object, TContext, object>);
  }

  getPluginSet(): { readonly [key: string]: LabPluginDescriptor<object, object, object, object> } {
    const result: { [key: string]: LabPluginDescriptor<object, object, object, object> } = {};
    for (const plugin of this.plugins) {
      result[String(plugin.id)] = plugin;
    }
    return result;
  }

  add(plugin: LabPluginDescriptor<object, object, object, object>): PluginLease {
    if (this.registered.has(String(plugin.id))) {
      throw new Error(`plugin already registered: ${String(plugin.id)}`);
    }

    this.registered.set(String(plugin.id), {
      id: plugin.id,
      config: plugin.config,
      registeredAt: new Date().toISOString(),
    });

    for (const phase of plugin.supportedPhases) {
      const bucket = this.byPhase.get(phase) ?? [];
      bucket.push(plugin);
      this.byPhase.set(phase, bucket);
    }

    let active = true;
    const pluginId = plugin.id;
    const registered = this.registered;
    return {
      pluginId,
      [Symbol.dispose](): void {
        if (!active) {
          return;
        }
        active = false;
        registered.delete(String(pluginId));
      },
    };
  }

  async executePhase<TInput extends object, TOutput extends object, TContext extends object>(
    phase: PluginStage,
    context: TContext,
    input: TInput,
    runId: PluginRunId,
  ): Promise<readonly PluginResult<TOutput>[]> {
    const outputs: PluginResult<TOutput>[] = [];
    const candidates = this.byPhase.get(phase) ?? [];

    for (const candidate of candidates) {
      const typed = candidate as unknown as LabPluginDescriptor<TInput, TOutput, TContext, object>;
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const result = (await typed.execute({
        plugin: typed.id,
        input,
        context,
        phase,
        runId,
        startedAt,
      })) as PluginResult<TOutput>;

      const elapsedMs = Math.max(0, performance.now() - started);
      outputs.push({
        output: result.output,
        trace: withPluginTrace(typed.id, phase, startedAt, elapsedMs, result.trace.status),
      });

      if (typed.teardown) {
        await typed.teardown(result, context);
      }
    }

    return outputs;
  }
}

export const definePlugins = <
  const TPlugins extends readonly LabPluginDescriptor<object, object, object, object>[],
>(plugins: TPlugins): TPlugins => {
  const ids = plugins.map((plugin) => String(plugin.id));
  if (new Set(ids).size !== ids.length) {
    throw new Error('duplicated-plugin-id');
  }
  return plugins;
};

export const toPluginRegistry = <
  const TPlugins extends readonly LabPluginDescriptor<object, object, object, object>[],
>(plugins: TPlugins): PluginRegistry<TPlugins> => new PluginRegistry(plugins);

export const pluginEventsAsPayload = <
  TInput extends object,
  TOutput extends object,
  TContext extends object,
>(
  events: readonly PluginResult<PluginExecutionEvent<TContext, TInput>>[],
): { readonly labels: readonly string[]; readonly counts: Record<string, number> } => {
  const counts = new Map<string, number>();
  const labels = events.map((entry) => {
    const eventInput = entry as unknown as { input?: { id?: unknown } };
    const label = `input=${String(eventInput.input?.id ?? 'event')}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return label;
  });

  return {
    labels,
    counts: Object.fromEntries(counts),
  };
};

export const isRecoverableFailure = (status: PluginResultStatus): boolean => status === 'warn' || status === 'fail';

export const selectFatalPlugins = <TPlugins extends readonly LabPluginDescriptor<object, object, object, object>[]>(
  plugins: TPlugins,
): readonly PluginName<string>[] =>
  plugins
    .filter((plugin) => plugin.version !== '0.0.0')
    .filter((plugin) => plugin.label.length > 0)
    .map((plugin) => plugin.id);
