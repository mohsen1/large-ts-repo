import {
  asChronicleGraphEdgeId,
  asChronicleGraphLane,
  asChronicleGraphPhase,
  asChronicleGraphPlanId,
  asChronicleGraphNodeId,
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  asChronicleGraphRoute,
  buildTrace,
  type ChronicleGraphBlueprint,
  type ChronicleGraphContext,
  type ChronicleGraphNode,
  type ChronicleGraphPhase,
  type ChronicleGraphScenario,
  type ChronicleGraphTrace,
} from './identity.js';
import { buildNodeTopology } from './topology.js';
import { type Brand, type NoInfer } from '@shared/type-level';
import { type ChronicleGraphPluginDescriptor } from './identity.js';

export type PolicyBucket = 'conservative' | 'balanced' | 'aggressive';

export interface ChronicleGraphPolicy {
  readonly mode: PolicyBucket;
  readonly weight: number;
  readonly route: string;
  readonly tenant: string;
}

export type ChronicleGraphPolicyMode = PolicyBucket;

export interface GraphPlanBlueprint<TBlueprint extends ChronicleGraphBlueprint> {
  readonly blueprint: TBlueprint;
  readonly runId: ReturnType<typeof buildTrace>['id'];
  readonly phases: readonly ChronicleGraphPhase[];
}

export const collectPolicyDigest = (
  policy: ChronicleGraphPolicy,
): Brand<string, 'ChronicleGraphPolicyDigest'> => {
  return `${policy.mode}:${policy.weight}:${policy.route}` as Brand<string, 'ChronicleGraphPolicyDigest'>;
};

export const policyForMode = (mode: ChronicleGraphPolicyMode): { readonly maxParallelism: number; readonly latencyBudgetMs: number } =>
  mode === 'conservative'
    ? { maxParallelism: 1, latencyBudgetMs: 2_000 }
    : mode === 'balanced'
      ? { maxParallelism: 3, latencyBudgetMs: 1_000 }
      : { maxParallelism: 8, latencyBudgetMs: 400 };

export const buildPhases = (mode: ChronicleGraphPolicyMode): readonly ChronicleGraphPhase[] => {
  if (mode === 'conservative') {
    return [
      asChronicleGraphPhase('bootstrap'),
      asChronicleGraphPhase('verification'),
      asChronicleGraphPhase('recovery'),
    ];
  }

  if (mode === 'balanced') {
    return [
      asChronicleGraphPhase('bootstrap'),
      asChronicleGraphPhase('discovery'),
      asChronicleGraphPhase('execution'),
      asChronicleGraphPhase('verification'),
    ];
  }

  return [
    asChronicleGraphPhase('bootstrap'),
    asChronicleGraphPhase('discovery'),
    asChronicleGraphPhase('execution'),
    asChronicleGraphPhase('verification'),
    asChronicleGraphPhase('recovery'),
  ];
};

export const buildPlan = <TBlueprint extends ChronicleGraphBlueprint>(
  blueprint: NoInfer<TBlueprint>,
  mode: ChronicleGraphPolicyMode,
): GraphPlanBlueprint<TBlueprint> => {
  const topology = buildNodeTopology(blueprint);
  const phases = buildPhases(mode);

  if (topology.ordered.length === 0) {
    return {
      blueprint: {
        ...blueprint,
        nodes: [...blueprint.nodes],
        edges: [...blueprint.edges],
      },
      runId: buildTrace(blueprint.tenant, blueprint.id, blueprint.route).id,
      phases,
    };
  }

  const normalizedNodes = topology.ordered.map((nodeId, index): ChronicleGraphNode => {
    const next = blueprint.nodes.find((node) => node.id === nodeId);
    const source = next ?? {
      id: nodeId,
      name: String(nodeId).replace('node:', ''),
      lane: asChronicleGraphLane('control'),
      dependsOn: [],
      labels: { normalized: true },
    };
    return {
      ...source,
      dependsOn: index === 0 ? [] : [topology.ordered[index - 1]],
      labels: {
        ...source.labels,
        order: index,
      },
    };
  });

  const normalizedEdges = normalizedNodes
    .map((node, index, all) =>
      index === 0
        ? undefined
        : {
            id: asChronicleGraphEdgeId(`plan:${blueprint.id}:${index}`),
            from: all[index - 1].id,
            to: node.id,
            weight: 1 + index * 0.1,
            predicates: ['derived'],
          },
    )
    .filter((edge): edge is Exclude<typeof edge, undefined> => Boolean(edge));

  return {
    blueprint: {
      ...blueprint,
      nodes: normalizedNodes,
      edges: normalizedEdges,
    },
    runId: buildTrace(blueprint.tenant, blueprint.id, blueprint.route).id,
    phases,
  };
};

export const phaseWeights = <T extends readonly ChronicleGraphPhase[]>(phases: T): readonly {
  readonly phase: T[number];
  readonly weight: number;
  readonly label: `${T[number]}`;
}[] => {
  if (phases.length === 0) return [] as const;
  return phases.map((phase, index) => ({
    phase,
    weight: (index + 1) * 0.25,
    label: `${phase}`,
  }));
};

export const parseMode = (value: string): ChronicleGraphPolicyMode =>
  value === 'aggressive' || value === 'conservative' ? value : 'balanced';

export const toStrategyTrace = (input: {
  readonly tenant: string;
  readonly route: string;
  readonly mode: ChronicleGraphPolicyMode;
}): ChronicleGraphTrace => {
  const tenant = asChronicleGraphTenantId(input.tenant);
  const route = asChronicleGraphRoute(input.route);
  return {
    id: buildTrace(tenant, asChronicleGraphPlanId(input.route), route).id,
    tenant,
    plan: asChronicleGraphPlanId(input.route),
    phases: buildPhases(input.mode),
    startedAt: Date.now(),
  };
};

export const buildStrategyPlan = <TScenario extends ChronicleGraphScenario>(
  scenario: NoInfer<TScenario>,
  pluginCount: number,
): ReturnType<typeof buildPlan<TScenario['blueprint']>> => {
  const mode: ChronicleGraphPolicyMode = pluginCount > 4 ? 'aggressive' : pluginCount > 2 ? 'balanced' : 'conservative';
  return buildPlan(scenario.blueprint, mode);
};

export const toPluginPhases = (
  plugins: readonly ChronicleGraphPluginDescriptor[],
): readonly ChronicleGraphPhase[] => {
  const phases = plugins.flatMap((plugin) => plugin.supports);
  return [...new Set(phases)].toSorted((left, right) => left.localeCompare(right));
};
