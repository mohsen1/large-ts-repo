import { PluginContext, PluginId, PluginInput, PluginOutput, OrchestratorPhase, StageName, makeTraceId } from './domain.js';
import { NoInfer } from '@shared/type-level';

export interface OrchestratorPluginDescriptor<
  TName extends string = string,
  TPhase extends OrchestratorPhase = OrchestratorPhase,
  TInput extends object = object,
  TOutput extends object = object,
> {
  readonly id: PluginId;
  readonly name: TName;
  readonly phase: TPhase;
  readonly version: string;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginId[];
  canProcess(input: TInput): input is TInput;
  process(
    input: PluginInput<TInput>,
    context: PluginContext,
  ): Promise<{
    readonly status: 'ok' | 'skip' | 'degraded';
    readonly output?: PluginOutput<TOutput>;
    readonly signal: number;
  }>;
}

export type PluginManifest<TPlugins extends readonly OrchestratorPluginDescriptor[]> = {
  [P in TPlugins[number] as P['name']]: P['id'];
};

export type PluginByPhase<TPlugins extends readonly OrchestratorPluginDescriptor[], TPhase extends OrchestratorPhase> =
  Extract<TPlugins[number], { phase: TPhase }>;

export interface ExecutionWindow {
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly status: 'ok' | 'degraded';
}

const ORCHESTRATION_PHASES: readonly OrchestratorPhase[] = ['intake', 'validate', 'plan', 'execute', 'verify', 'finalize'];

export class PluginRegistry<TPlugins extends readonly OrchestratorPluginDescriptor[]> {
  #plugins: TPlugins;
  #byPhase: Map<OrchestratorPhase, Array<TPlugins[number]>>;
  #history: Map<PluginId, ExecutionWindow> = new Map();

  constructor(
    plugins: TPlugins,
    private readonly namespace: string,
  ) {
    this.#plugins = plugins;
    this.#byPhase = new Map(
      ORCHESTRATION_PHASES.map((phase) => [
        phase,
        plugins.filter((plugin): plugin is TPlugins[number] => plugin.phase === phase),
      ]),
    );
  }

  get available(): readonly TPlugins[number][] {
    return [...this.#plugins];
  }

  get audit(): PluginManifest<TPlugins> {
    const out: Record<string, PluginId> = {};
    for (const plugin of this.#plugins) {
      out[plugin.name as string] = plugin.id;
    }
    return out as PluginManifest<TPlugins>;
  }

  getByPhase<const TPhase extends OrchestratorPhase>(phase: TPhase): readonly PluginByPhase<TPlugins, TPhase>[] {
    return (this.#byPhase.get(phase) as Array<PluginByPhase<TPlugins, TPhase>>) ?? [];
  }

  async runPhase<TInput extends object, TOutput extends object>(
    phase: OrchestratorPhase,
    input: NoInfer<PluginInput<TInput>>,
    context: PluginContext,
  ): Promise<readonly {
    readonly status: 'ok' | 'skip' | 'degraded';
    readonly output?: PluginOutput<TOutput>;
    readonly signal: number;
  }[]> {
    const plugins = this.getByPhase(phase);
    const out: Array<{
      readonly status: 'ok' | 'skip' | 'degraded';
      readonly output?: PluginOutput<TOutput>;
      readonly signal: number;
    }> = [];

    for (const plugin of plugins) {
      const startedAt = Date.now();
      if (!plugin.canProcess(input.payload)) {
        this.#history.set(plugin.id, { startedAt, endedAt: Date.now(), status: 'degraded' });
        continue;
      }

      const result = await plugin.process(input, context);
      this.#history.set(plugin.id, {
        startedAt,
        endedAt: Date.now(),
        status: result.status === 'ok' ? 'ok' : 'degraded',
      });
      out.push(result as unknown as {
        readonly status: 'ok' | 'skip' | 'degraded';
        readonly output?: PluginOutput<TOutput>;
        readonly signal: number;
      });
    }

    return out;
  }

  asRecord(): PluginManifest<TPlugins> {
    return this.audit;
  }

  get traceId(): string {
    return makeTraceId(this.namespace as any);
  }

  history(pluginId?: PluginId): readonly ExecutionWindow[] {
    const entries = [...this.#history.entries()].filter(([id]) => !pluginId || id === pluginId);
    return entries.map(([, value]) => value);
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#plugins[Symbol.iterator]();
  }

  [Symbol.dispose](): void {
    this.#history.clear();
  }
}

export function createRegistry<TPlugins extends readonly OrchestratorPluginDescriptor[]>(
  namespace: string,
  plugins: TPlugins,
): PluginRegistry<TPlugins> {
  return new PluginRegistry<TPlugins>(plugins, namespace);
}

export function buildManifest<TPlugins extends readonly OrchestratorPluginDescriptor[]>(plugins: TPlugins): {
  manifest: PluginManifest<TPlugins>;
  map: Map<PluginId, StageName>;
} {
  const registry = new PluginRegistry(plugins, 'manifest');
  const manifest = registry.asRecord();
  const map = new Map<PluginId, StageName>(
    plugins.map((plugin) => [plugin.id, `stage:${plugin.phase}` as StageName]),
  );
  return { manifest, map };
}

export function reorderByPhase<TPlugins extends readonly OrchestratorPluginDescriptor[]>(
  plugins: TPlugins,
  priority: readonly OrchestratorPhase[],
): TPlugins {
  const ordered: Array<TPlugins[number]> = [];

  for (const phase of priority) {
    for (const plugin of plugins.filter((entry) => entry.phase === phase)) {
      if (!ordered.includes(plugin)) {
        ordered.push(plugin);
      }
    }
  }

  for (const plugin of plugins) {
    if (!ordered.includes(plugin)) {
      ordered.push(plugin);
    }
  }

  return ordered as unknown as TPlugins;
}

export function summarizePlugins<TPlugins extends readonly OrchestratorPluginDescriptor[]>(
  plugins: TPlugins,
): ReadonlyArray<{ name: TPlugins[number]['name']; phase: OrchestratorPhase; id: PluginId }> {
  return plugins.map((plugin) => ({
    name: plugin.name,
    phase: plugin.phase,
    id: plugin.id,
  }));
}

export function collectSignals<TPlugins extends readonly OrchestratorPluginDescriptor[]>(plugins: TPlugins): ReadonlyArray<PluginId> {
  return plugins.map((plugin) => plugin.id);
}
