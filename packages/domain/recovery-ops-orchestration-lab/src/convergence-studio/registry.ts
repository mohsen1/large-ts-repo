import { buildBlueprintRegistry, resolveBlueprintById, type BlueprintRegistryEntry, type ConvergenceBlueprintOutput } from './manifest';
import {
  ConvergencePluginDescriptor,
  ConvergencePluginId,
  ConvergenceRunId,
  ConvergencePlanId,
  ConvergenceStudioId,
  ConvergenceTemplateName,
  ConvergenceLifecycle,
  ConvergenceStage,
  ConvergenceContext,
  PluginMap,
  PluginLookup,
  StageMap,
  ConvergenceSummary,
  NoInferPlugin,
  normalizeRunId,
  normalizePlanId,
  normalizeStudioId,
  normalizeConvergenceTag,
  normalizeSummary,
} from './types';

export interface RegistryObserver {
  onRegister(descriptor: ConvergencePluginDescriptor): void;
  onSelect(planId: ConvergencePlanId, runId: ConvergenceRunId): void;
}

interface RegistryEntryState {
  readonly plugin: ConvergencePluginDescriptor;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface RegistryPlan {
  readonly id: ConvergencePlanId;
  readonly runId: ConvergenceRunId;
  readonly studioId: ConvergenceStudioId;
  readonly stage: ConvergenceLifecycle;
  readonly plugins: readonly ConvergencePluginId[];
}

export class ConvergenceStudioRegistry<TPlugins extends readonly ConvergencePluginDescriptor[]> implements AsyncDisposable {
  #byId = new Map<string, ConvergencePluginDescriptor>();
  #byStage = new Map<ConvergenceStage, ConvergencePluginDescriptor[]>();
  #order: ConvergencePluginDescriptor[] = [];
  #history: RegistryEntryState[] = [];
  #disposed = false;

  constructor(
    private readonly blueprintRegistry: ReadonlyMap<string, BlueprintRegistryEntry>,
    private readonly observers: RegistryObserver[],
    private readonly plugins: NoInfer<TPlugins>,
  ) {
    for (const plugin of this.plugins) {
      this.register(plugin as ConvergencePluginDescriptor);
    }
    for (const plugin of this.plugins) {
      const existing = this.#byStage.get(plugin.stage) ?? [];
      this.#byStage.set(plugin.stage, [...existing, plugin]);
    }
  }

  register(constraint: NoInferPlugin<ConvergencePluginDescriptor>): void {
    if (this.#disposed) {
      throw new Error('registry disposed');
    }
    const plugin = constraint as ConvergencePluginDescriptor;
    this.#byId.set(plugin.id, plugin);
    this.#order.push(plugin);
    this.#history.push({ plugin, sequence: this.#history.length + 1, createdAt: new Date().toISOString() });
    this.observers.forEach((observer) => observer.onRegister(plugin));
  }

  all(): readonly ConvergencePluginDescriptor[] {
    return [...this.#order];
  }

  get(id: ConvergencePluginId): PluginLookup<TPlugins, ConvergencePluginId> {
    return this.#byId.get(id) as PluginLookup<TPlugins, ConvergencePluginId>;
  }

  byStage(stage: ConvergenceStage): readonly ConvergencePluginDescriptor[] {
    return [...(this.#byStage.get(stage) ?? [])];
  }

  asMap(): PluginMap<TPlugins> {
    const map = {} as PluginMap<TPlugins>;
    for (const plugin of this.#order) {
      map[plugin.id as keyof PluginMap<TPlugins>] = plugin as PluginMap<TPlugins>[keyof PluginMap<TPlugins>];
    }
    return map;
  }

  asStageMap(): StageMap<TPlugins> {
    return {
      discover: this.byStage('discover'),
      evaluate: this.byStage('evaluate'),
      simulate: this.byStage('simulate'),
      execute: this.byStage('execute'),
      close: this.byStage('close'),
    } as StageMap<TPlugins>;
  }

  pluginByIdList(ids: readonly ConvergencePluginId[]): readonly ConvergencePluginDescriptor[] {
    const out = ids
      .map((id) => this.get(id) as ConvergencePluginDescriptor | undefined)
      .filter((value): value is ConvergencePluginDescriptor => value !== undefined);
    return out;
  }

  compilePlan(
    name: ConvergenceTemplateName,
    context: ConvergenceContext,
    overrides: ReadonlyMap<ConvergencePluginId, boolean> = new Map(),
  ): RegistryPlan {
    const blueprint = this.lookupBlueprint(name);
    const pluginIds = blueprint.stages.flatMap((stage) => this.byStage(stage)).map((plugin) => plugin.id);
    const selected = pluginIds.filter((id) => overrides.get(id) ?? true);
    const plan = {
      id: normalizePlanId(`${context.workspaceId}:${Date.now()}`),
      runId: normalizeRunId(`${context.runId}::${name}`),
      studioId: normalizeStudioId(context.workspaceId),
      stage: 'queued' as ConvergenceLifecycle,
      plugins: selected,
    };
    this.observers.forEach((observer) => observer.onSelect(plan.id, plan.runId));
    return plan;
  }

  async summarizePlans(): Promise<readonly ConvergenceSummary[]> {
    const output: ConvergenceSummary[] = [];
    const constraints = normalizeConstraintWeightMap(
      [...this.#byId.values()].reduce<Record<string, number>>((acc, plugin) => {
        acc[plugin.id] = plugin.priority;
        return acc;
      }, {}),
    );

    for (const plugin of this.#order) {
      const record = this.#byId.get(plugin.id);
      if (!record) continue;
      const stages = this.#history
        .filter((entry) => entry.plugin.id === plugin.id)
        .map((entry) => entry.plugin.stage);
      output.push({
        runId: normalizeRunId(`run-${Date.now()}`),
        workspaceId: normalizeStudioId(`studio-${plugin.id}`),
        stageTrail: stages,
        selectedPlugins: [plugin.id],
        score: plugin.priority / 10,
        tags: [normalizeConvergenceTag(plugin.id)],
        diagnostics: [
          ...plugin.facets,
          plugin.template,
          `stage=${plugin.stage}`,
          `plugins=${this.#order.length}`,
          `constraints=${constraints[plugin.id] ?? 0}`,
        ],
      });
    }

    return output;
  }

  private lookupBlueprint(name: ConvergenceTemplateName) {
    const byId = resolveBlueprintById(this.blueprintRegistry, name);
    if (!byId) {
      throw new Error(`missing blueprint: ${name}`);
    }
    return byId;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#history.length = 0;
    this.#order = [];
    this.#byId.clear();
    this.#byStage.clear();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

export interface RegistryFactoryInput {
  readonly templates: readonly ConvergenceBlueprintOutput[];
  readonly plugins: readonly ConvergencePluginDescriptor[];
}

export const createConvergenceRegistry = async (input: RegistryFactoryInput): Promise<ConvergenceStudioRegistry<readonly ConvergencePluginDescriptor[]>> => {
  const entries = buildBlueprintRegistry(input.templates);
  return new ConvergenceStudioRegistry(
    entries,
    [
      {
        onRegister: () => undefined,
        onSelect: () => undefined,
      },
    ],
    input.plugins,
  );
};

export const classifyPluginsByStage = <
  TPlugins extends readonly ConvergencePluginDescriptor[],
>(plugins: TPlugins): {
  readonly discover_plugins: readonly Extract<TPlugins[number], { readonly stage: 'discover' }>[];
  readonly evaluate_plugins: readonly Extract<TPlugins[number], { readonly stage: 'evaluate' }>[];
  readonly simulate_plugins: readonly Extract<TPlugins[number], { readonly stage: 'simulate' }>[];
  readonly execute_plugins: readonly Extract<TPlugins[number], { readonly stage: 'execute' }>[];
  readonly close_plugins: readonly Extract<TPlugins[number], { readonly stage: 'close' }>[];
} => {
  return {
    discover_plugins: plugins.filter(
      (plugin): plugin is Extract<TPlugins[number], { readonly stage: 'discover' }> => plugin.stage === 'discover',
    ),
    evaluate_plugins: plugins.filter(
      (plugin): plugin is Extract<TPlugins[number], { readonly stage: 'evaluate' }> => plugin.stage === 'evaluate',
    ),
    simulate_plugins: plugins.filter(
      (plugin): plugin is Extract<TPlugins[number], { readonly stage: 'simulate' }> => plugin.stage === 'simulate',
    ),
    execute_plugins: plugins.filter(
      (plugin): plugin is Extract<TPlugins[number], { readonly stage: 'execute' }> => plugin.stage === 'execute',
    ),
    close_plugins: plugins.filter(
      (plugin): plugin is Extract<TPlugins[number], { readonly stage: 'close' }> => plugin.stage === 'close',
    ),
  };
};

const normalizeConstraintWeightMap = (input: Record<string, number>): Record<string, number> => ({
  ...input,
});

const dedupePlugins = <TPlugins extends readonly ConvergencePluginDescriptor[]>(
  plugins: TPlugins,
): readonly ConvergencePluginDescriptor[] => {
  const seen = new Set<string>();
  const out: ConvergencePluginDescriptor[] = [];
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) {
      continue;
    }
    seen.add(plugin.id);
    out.push(plugin);
  }
  return out;
};

const summarize = (
  selected: readonly ConvergencePluginDescriptor[],
): readonly ConvergenceSummary[] =>
  selected.map((plugin) =>
    normalizeSummary({
      runId: normalizeRunId(`run:${plugin.id}:${Date.now()}`),
      workspaceId: normalizeStudioId(`studio:${plugin.id}`),
      stageTrail: [plugin.stage],
      selectedPlugins: [plugin.id],
      score: Math.min(1, plugin.priority / 100),
      tags: [normalizeConvergenceTag(plugin.template), normalizeConvergenceTag(`facet-${plugin.facets[0] ?? 'planner'}`)],
      diagnostics: [
        `plugin=${plugin.id}`,
        `stage=${plugin.stage}`,
        `name=${plugin.name}`,
      ],
    }),
  );

export const summarizeRegistry = (
  registry: ConvergenceStudioRegistry<readonly ConvergencePluginDescriptor[]>,
): readonly ConvergenceSummary[] => {
  const plugins = dedupePlugins(registry.all());
  return summarize(plugins);
};
