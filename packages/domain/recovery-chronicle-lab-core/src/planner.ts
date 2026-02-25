import {
  asChronicleRunId,
  asChronicleTag,
  defaultRouteSamples,
  type ChroniclePhase,
  type ChroniclePluginCatalog,
  type ChroniclePluginDescriptor,
  type ChronicleRoute,
  type ChronicleTenantId,
  type PluginStateByPhase,
  buildChronicleScope,
} from '@shared/chronicle-orchestration-protocol';
import {
  buildTimeline,
  buildTopology,
  normalizePhases,
  phaseWeightsSnapshot,
  type TopologyGraph,
  type StageDescriptor,
} from '@shared/chronicle-orchestration-protocol';
import {
  initialContext,
  makeBlueprint,
  mapMetricPage,
  normalizeGoal,
  type PlannerInput,
  type Blueprint,
  type PlannerOutput,
  type PlannerResult,
  type BlueprintTemplate,
  type BlueprintPhase,
  type PluginBundle,
  type PlannerState,
  type RunGoal,
  type SimulationInput,
} from './models';

export interface PlannerWorkspace {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly phaseList: readonly BlueprintPhase[];
  readonly pluginCatalog: PluginBundle;
  readonly topology: TopologyGraph;
  readonly goals: readonly RunGoal[];
}

const weightsByPhase: Record<string, number> = {
  'phase:boot': 1,
  'phase:signal': 2,
  'phase:policy': 3,
  'phase:verify': 4,
  'phase:finalize': 5,
} as const;

const asChroniclePhase = (phase: BlueprintPhase): ChroniclePhase => phase;

const buildTopologyStages = (phases: readonly BlueprintPhase[]): readonly StageDescriptor[] =>
  phases.map((phase) => ({
    phase: asChroniclePhase(phase),
    weight: weightsByPhase[phase] ?? phaseWeightsSnapshot([])['phase:boot'],
  }));

export const inferTemplate = <T extends readonly BlueprintPhase[]>(phases: T): T => phases;

export const makeWorkspace = (input: PlannerInput): PlannerWorkspace => {
  const template: BlueprintTemplate = {
    tenant: input.tenant,
    route: input.route,
    phases: input.phases,
    budgetMs: input.limit ?? 1000,
    tags: ['planner', 'runtime', `tenant:${input.tenant}`],
  };

  const blueprint = makeBlueprint(template);
  const normalizedPhases = normalizePhases(input.phases);
  const context = initialContext(input.tenant, input.route);
  const stageDescriptors = buildTopologyStages(normalizedPhases);
  const topology = buildTimeline(context.route, stageDescriptors);
  const topologyScore = toTopologyWeightSum(topology);

  const byPhase = input.plugins.reduce<Partial<Record<BlueprintPhase, ChroniclePluginDescriptor>>>((acc, plugin) => {
    const phase = plugin.supports[0];
    if (phase) acc[phase] = plugin;
    return acc;
  }, {});

  return {
    tenant: blueprint.tenant,
    route: blueprint.route,
    phaseList: normalizedPhases,
    pluginCatalog: {
      byPhase,
      plugins: input.plugins.toSorted((left, right) => {
        const leftW = weightsByPhase[left.supports[0] ?? 'phase:boot'] ?? 0;
        const rightW = weightsByPhase[right.supports[0] ?? 'phase:boot'] ?? 0;
        return leftW - rightW;
      }),
    },
    goals: [normalizeGoal(input.goal)],
    topology: {
      ...topology,
      nodes: topology.nodes.toReversed(),
    },
  };
};

export const makePlan = (input: PlannerInput): PlannerOutput => {
  const template: BlueprintTemplate = {
    tenant: input.tenant,
    route: input.route,
    phases: input.phases,
    budgetMs: input.limit ?? 1000,
    tags: ['planner', 'derived', buildChronicleScope(input.tenant)],
  };

  const blueprint = makeBlueprint(template);
  const workspace = makeWorkspace(input);
  const context = initialContext(input.tenant, input.route);

  return {
    blueprint,
    plugins: workspace.pluginCatalog,
    context: {
      ...context,
      runId: asChronicleRunId(blueprint.tenant, blueprint.route),
      startedAt: Date.now(),
    },
  };
};

export const withPlan = <TPhases extends readonly BlueprintPhase[]>(
  phases: TPhases,
  ...inputs: readonly BlueprintPhase[]
): PlannerResult<TPhases> => {
  const normalized = inferTemplate(phases);
  const blueprint = makeBlueprint({
    tenant: 'tenant:planner',
    route: defaultRouteSamples.at(0) ?? 'chronicle://planner',
    phases: normalized,
    budgetMs: 1200,
    tags: [...inputs.map((entry) => String(entry))],
  });

  return {
    blueprint,
    orderedPhases: normalized,
    plugins: {
      byPhase: {},
      plugins: [],
    },
  };
};

export const updateState = (state: PlannerState, blueprint: Blueprint): PlannerState => {
  const nextQueue = [blueprint.id, ...state.queue].slice(0, 5);
  const nextWarnings = mapMetricPage(
    blueprint.tags,
    {
      items: blueprint.tags.slice(0, 5),
      hasMore: false,
      nextCursor: String(state.queue.length),
    },
  ).map((value) => String(value));

  return {
    ...state,
    activeBlueprint: blueprint,
    queue: nextQueue,
    warnings: nextWarnings,
  };
};

export const normalizePluginsByPhase = <T extends ChroniclePluginCatalog>(
  plugins: T,
): PluginStateByPhase<T, ChroniclePhase> => {
  const keyed = Object.entries(plugins) as Array<[string, ChroniclePluginDescriptor]>;
  return keyed.reduce<Record<string, ChroniclePluginDescriptor>>((acc, [id, plugin]) => {
    const phase = plugin.supports[0];
    if (phase) acc[id] = plugin;
    return acc;
  }, {}) as PluginStateByPhase<T, ChroniclePhase>;
};

export const planFromSimulation = (input: SimulationInput, fallback: readonly ChroniclePluginDescriptor[]): PlannerOutput => {
  const workspace = makeWorkspace({
    tenant: input.tenant,
    route: input.route,
    phases: ['phase:boot', 'phase:signal', 'phase:policy', 'phase:verify', 'phase:finalize'],
    plugins: fallback,
    limit: 1200,
    goal: {
      kind: 'maximize-coverage',
      target: 90,
    },
  });

  return {
    blueprint: makeBlueprint({
      tenant: input.tenant,
      route: input.route,
      phases: workspace.phaseList,
      budgetMs: 1500,
      tags: ['simulation'],
    }),
    plugins: workspace.pluginCatalog,
    context: initialContext(input.tenant, input.route),
  };
};

export const routeLabel = (workspace: PlannerWorkspace): string => `${workspace.tenant}/${workspace.route}`;

export const phaseTokens = (phase: BlueprintPhase): readonly string[] => [
  phase,
  asChronicleTag(phase).toString(),
  buildChronicleScope(phase),
];

const toTopologyWeightSum = (graph: TopologyGraph): number =>
  graph.nodes.reduce((acc, node, index) => acc + index + node.phase.length + node.scope.length, 0);
