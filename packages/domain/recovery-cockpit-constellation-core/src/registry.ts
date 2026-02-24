import type { NoInfer } from '@shared/type-level';
import { rankByScore } from '@shared/util';
import type { ConstellationMode, ConstellationStage } from './ids';
import type { ConstellationEvent, ConstellationEventCategory, ConstellationPlugin, PluginByStage } from './plugins';

export type RegistryMode = 'open' | 'locked' | 'shadow';

export type RegistryConstraint = {
  readonly allowedKinds: readonly ConstellationStage[];
  readonly maxDepth: number;
  readonly allowShadow: boolean;
  readonly pluginTags: Readonly<Record<ConstellationEventCategory, readonly string[]>>;
};

type PluginBucket = Readonly<{
  [K in ConstellationMode as `mode:${K}`]: readonly ConstellationPlugin[];
}>;

type StageIndex = {
  [K in ConstellationStage]: readonly ConstellationPlugin[];
};

export const DEFAULT_CONSTRAINT = {
  allowedKinds: ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'],
  maxDepth: 16,
  allowShadow: false,
  pluginTags: {
    metric: ['score', 'latency', 'capacity'],
    risk: ['critical', 'advisory'],
    policy: ['required', 'override'],
    telemetry: ['heartbeat', 'trace'],
    plan: ['manifest', 'snapshot'],
  },
} as const satisfies RegistryConstraint;

export class ConstellationPluginRegistry {
  readonly #entries = new Map<string, ConstellationPlugin>();
  readonly #constraint: RegistryConstraint;

  constructor(
    private readonly plugins: readonly ConstellationPlugin[],
    constraint: RegistryConstraint = DEFAULT_CONSTRAINT,
  ) {
    this.#constraint = constraint;
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  [Symbol.toStringTag] = 'ConstellationPluginRegistry';

  private isAllowedKind = (kind: string): kind is ConstellationStage =>
    this.#constraint.allowedKinds.includes(kind as ConstellationStage);

  register<TPlugin extends ConstellationPlugin>(
    plugin: NoInfer<TPlugin>,
  ): TPlugin {
    if (this.#entries.size >= this.#constraint.maxDepth) {
      throw new Error('registry depth limit reached');
    }

    if (!this.isAllowedKind(plugin.kind)) {
      throw new Error(`stage ${plugin.kind} is not allowed`);
    }

    if (!plugin.enabled && !this.#constraint.allowShadow) {
      throw new Error(`disabled plugin ${plugin.id} blocked by registry mode`);
    }

    if (this.#entries.has(plugin.id)) {
      throw new Error(`duplicate plugin id ${plugin.id}`);
    }

    this.#entries.set(plugin.id, plugin);
    return plugin;
  }

  remove(pluginId: string): boolean {
    return this.#entries.delete(pluginId);
  }

  get(pluginId: string): ConstellationPlugin | undefined {
    return this.#entries.get(pluginId);
  }

  getAll(): readonly ConstellationPlugin[] {
    return [...this.#entries.values()];
  }

  byKind<TStage extends ConstellationStage>(
    stage: TStage,
  ): ReadonlyArray<PluginByStage<TStage, readonly ConstellationPlugin[]>> {
    const all = [...this.#entries.values()].filter((entry) => entry.kind === stage);
    const byDependencyDepth = all.slice().sort(
      (left, right) => left.dependsOn.length - right.dependsOn.length,
    );
    return byDependencyDepth as PluginByStage<TStage, readonly ConstellationPlugin[]>[];
  }

  byMode<TMode extends ConstellationMode>(mode: TMode): readonly ConstellationPlugin[] {
    return [...this.#entries.values()].filter((entry) => entry.mode === mode);
  }

  asBuckets(): {
    byKind: StageIndex;
    byMode: PluginBucket;
  } {
    const byKindEntries = this.getAll().reduce((acc, plugin) => {
      const current = acc[plugin.kind] ?? [];
      return {
        ...acc,
        [plugin.kind]: [...current, plugin],
      } as StageIndex;
      }, {} as StageIndex);

    const byModeEntries = this.getAll().reduce((acc, plugin) => {
      const key = `mode:${plugin.mode}` as keyof PluginBucket & `mode:${string}`;
      const current = acc[key] ?? [];
      return {
        ...acc,
        [key]: [...current, plugin],
      } as PluginBucket;
      }, {} as PluginBucket);

    return { byKind: byKindEntries, byMode: byModeEntries };
  }

  query(predicate: (plugin: ConstellationPlugin) => boolean): readonly ConstellationPlugin[] {
    return this.getAll().filter(predicate).toSorted((left, right) => left.kind.localeCompare(right.kind));
  }

  diagnostics(event: ConstellationEvent): string[] {
    const scored = rankByScore([
      { kind: 'metric', tag: event.kind, value: event.tags.length },
      { kind: 'risk', tag: event.message, value: event.message.length },
    ], (entry) => entry.value);
    return scored.map((entry) => `${entry.kind}:${entry.tag}`);
  }
}

export const buildRegistry = (plugins: readonly ConstellationPlugin[]): ConstellationPluginRegistry =>
  new ConstellationPluginRegistry(plugins);

export const mapByKind = <TPlugins extends readonly ConstellationPlugin[]>(
  plugins: TPlugins,
): StageIndex =>
  plugins.reduce((acc, plugin) => ({
    ...acc,
    [plugin.kind]: [...(acc[plugin.kind] ?? []), plugin],
  }), {} as StageIndex);
