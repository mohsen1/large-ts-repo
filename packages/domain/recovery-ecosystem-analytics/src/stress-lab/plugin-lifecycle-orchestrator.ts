import {
  asNamespace,
  asRun,
  asTenant,
  asWindow,
} from '../identifiers';
import {
  summarizePluginOutputs,
  buildJourneyTrace,
  type JourneyToken,
} from './plugin-journey-types';
import { mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';
import type { PluginNode, PluginRunInput } from '../typed-plugin-types';
import { toPluginTraceId, type PluginRunResult } from '../typed-plugin-types';

type LifecyclePlugin<TKind extends string = string> = PluginNode<
  string,
  TKind,
  PluginRunInput,
  PluginRunResult,
  string
>;

export interface LifecycleContext {
  readonly runId: ReturnType<typeof asRun>;
  readonly tenant: ReturnType<typeof asTenant>;
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly window: ReturnType<typeof asWindow>;
}

export interface LifecycleTrace {
  readonly step: JourneyToken;
  readonly startedAt: string;
  readonly elapsedMs: number;
}

export interface LifecycleManifest<TPlugins extends readonly PluginNode[]> {
  readonly id: string;
  readonly context: LifecycleContext;
  readonly topology: readonly string[];
  readonly plugins: TPlugins;
}

export interface PluginLifecycleAdapter {
  readonly run: (input: PluginRunInput) => Promise<PluginRunResult>;
}

export interface PluginLifecycleRuntime<TPlugins extends readonly PluginNode[]> {
  readonly manifest: LifecycleManifest<TPlugins>;
  readonly run: (inputs: readonly PluginRunInput[]) => Promise<readonly PluginRunResult[]>;
  readonly trace: () => readonly LifecycleTrace[];
  readonly summarize: () => ReturnType<typeof summarizePluginOutputs>;
  readonly dispose: () => Promise<void>;
}

type StackState = {
  open: boolean;
};

const toTraceToken = (index: number, plugin: string): JourneyToken =>
  `journey:${index}:${plugin}`;

export class PluginLifecycle<TPlugins extends readonly LifecyclePlugin[]> implements PluginLifecycleRuntime<TPlugins> {
  readonly #plugins: TPlugins;
  readonly #adapters: readonly PluginLifecycleAdapter[];
  readonly #traces: LifecycleTrace[] = [];
  readonly #context: LifecycleContext;
  #state: StackState = { open: true };
  #stack = new AsyncDisposableStack();

  constructor(plugins: TPlugins, namespace = 'namespace:lifecycle') {
    this.#plugins = plugins;
    this.#context = {
      runId: asRun(`run:lifecycle-${Date.now()}`),
      tenant: asTenant('tenant:lifecycle'),
      namespace: asNamespace(namespace),
      window: asWindow(`window:lifecycle:${Date.now()}`),
    };
    this.#adapters = mapWithIteratorHelpers(this.#plugins, (plugin) => ({
      run: async (input) => plugin.run(input, {
        tenant: this.#context.tenant,
        namespace: this.#context.namespace,
        window: this.#context.window,
        runId: this.#context.runId,
        trace: toPluginTraceId(this.#context.runId),
      }),
    }));
  }

  get manifest(): LifecycleManifest<TPlugins> {
    const topology = mapWithIteratorHelpers(this.#plugins, (plugin) => plugin.name);
    return {
      id: `manifest:${this.#context.runId}`,
      context: this.#context,
      topology,
      plugins: this.#plugins as TPlugins,
    };
  }

  async run(inputs: readonly PluginRunInput[]): Promise<readonly PluginRunResult[]> {
    if (!this.#state.open) {
      throw new Error('lifecycle-closed');
    }
    const outputs: PluginRunResult[] = [];
    const resolved = buildJourneyTrace(
      mapWithIteratorHelpers(inputs, (entry) => entry.kind),
      this.#plugins,
    );

    for (let index = 0; index < this.#adapters.length; index += 1) {
      const adapter = this.#adapters[index];
      const plugin = this.#plugins[index];
      if (!adapter || !plugin) {
        continue;
      }
      const input = inputs[index] ?? inputs[0];
      if (!input) {
        continue;
      }
      const started = new Date().toISOString();
      const step = toTraceToken(index, plugin.name);
      this.#traces.push({ step, startedAt: started, elapsedMs: 0 });
      const result = await adapter.run(input);
      const elapsed = Date.now() - Date.parse(started);
      this.#traces.push({
        step: resolved[index] ?? step,
        startedAt: new Date().toISOString(),
        elapsedMs: elapsed,
      });
      outputs.push({
        ...result,
        signalCount: result.signalCount + 1,
      });
    }

    return outputs;
  }

  trace(): readonly LifecycleTrace[] {
    return [...this.#traces];
  }

  summarize(): ReturnType<typeof summarizePluginOutputs> {
    return summarizePluginOutputs(
      mapWithIteratorHelpers(this.#plugins, (plugin, index) => ({
        plugin: plugin.name,
        accepted: index % 3 !== 0,
        signalCount: plugin.weight,
        payload: {
          plugin: plugin.name,
          diagnostics: index,
        } as JsonValue,
        diagnostics: [{ step: `${plugin.name}:${index}`, latencyMs: index + 1 }],
      })),
    );
  }

  async dispose(): Promise<void> {
    if (!this.#state.open) {
      return;
    }
    this.#state.open = false;
    await this.#stack.disposeAsync();
  }
}

export const createLifecycle = async <TPlugins extends readonly LifecyclePlugin[]>(
  plugins: TPlugins,
): Promise<PluginLifecycle<TPlugins>> => {
  const lifecycle = new PluginLifecycle(plugins);
  await Promise.resolve(lifecycle.manifest);
  return lifecycle;
};
