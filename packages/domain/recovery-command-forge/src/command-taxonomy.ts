import type { Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { ForgeNode, ForgeDependency, ForgeScenario, ForgeNodePriority, ForgeTopology } from './types';

export type CommandIntent = Brand<string, 'ForgeCommandIntent'>;
export type CommandLane = Brand<string, 'ForgeCommandLane'>;
export type CommandPersona = 'operator' | 'automation' | 'platform' | 'safety';

export interface CommandTag {
  readonly key: string;
  readonly value: string;
}

export interface TaggedCommandNode extends ForgeNode {
  readonly intent: CommandIntent;
  readonly lane: CommandLane;
  readonly personas: readonly CommandPersona[];
  readonly tags: readonly CommandTag[];
}

export interface CommandProfile {
  readonly tenant: string;
  readonly zone: string;
  readonly laneWeights: Record<CommandPersona, number>;
  readonly criticalityMultiplier: number;
}

export interface CommandEnvelope {
  readonly tenant: string;
  readonly profile: CommandProfile;
  readonly scenario: ForgeScenario;
  readonly nodes: readonly TaggedCommandNode[];
}

export interface DependencyFlow {
  readonly source: ForgeDependency['dependencyId'];
  readonly targets: readonly ForgeDependency['dependencyId'][];
}

export interface TopologyIndex {
  readonly byOwner: Readonly<Record<string, readonly string[]>>;
  readonly byIntent: Readonly<Record<string, readonly string[]>>;
}

export interface CommandTaxonomySnapshot {
  readonly total: number;
  readonly byOwner: Readonly<Record<string, number>>;
  readonly byIntent: Readonly<Record<string, number>>;
  readonly byPersona: Readonly<Record<string, number>>;
}

export const buildCommandIntent = (input: string): CommandIntent =>
  withBrand(`intent:${input}`, 'ForgeCommandIntent');

export const buildCommandLane = (tenant: string, lane: string): CommandLane =>
  withBrand(`lane:${tenant}:${lane}`, 'ForgeCommandLane');

export const tagCommandNode = (
  node: ForgeNode,
  tenant: string,
  persona: CommandPersona,
): TaggedCommandNode => ({
  ...node,
  intent: buildCommandIntent(`${tenant}:${node.commandType}`),
  lane: buildCommandLane(tenant, node.commandType),
  personas: [persona, 'platform'],
  tags: [
    { key: 'team', value: node.ownerTeam },
    { key: 'commandType', value: node.commandType },
  ],
});

export const buildCommandProfile = (
  tenant: string,
  zone: string,
  criticalityMultiplier = 1,
): CommandProfile => ({
  tenant,
  zone,
  laneWeights: {
    operator: 0.4,
    automation: 0.35,
    platform: 0.2,
    safety: 0.05,
  },
  criticalityMultiplier: Math.min(2.5, Math.max(0.25, criticalityMultiplier)),
});

export const buildDependencyFlow = (
  nodes: readonly TaggedCommandNode[],
): readonly DependencyFlow[] => {
  const byDependency = new Map<ForgeDependency['dependencyId'], Set<ForgeDependency['dependencyId']>>();
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const sourceSet = byDependency.get(dep.dependencyId) ?? new Set<ForgeDependency['dependencyId']>();
      sourceSet.add(dep.dependencyId);
      byDependency.set(dep.dependencyId, sourceSet);
    }
  }

  return [...byDependency.entries()].map(([source, targets]) => ({
    source,
    targets: [...targets],
  }));
};

export const buildTopologyIndex = (nodes: readonly TaggedCommandNode[]): TopologyIndex => {
  const byOwnerEntries = nodes.reduce<Record<string, string[]>>((acc, node) => {
    acc[node.ownerTeam] ??= [];
    acc[node.ownerTeam].push(node.id);
    return acc;
  }, {});

  const byIntentEntries = nodes.reduce<Record<string, string[]>>((acc, node) => {
    acc[node.intent] ??= [];
    acc[node.intent].push(node.id);
    return acc;
  }, {});

  return {
    byOwner: byOwnerEntries,
    byIntent: byIntentEntries,
  };
};

export const buildCommandSnapshot = (nodes: readonly TaggedCommandNode[]): CommandTaxonomySnapshot => {
  const byOwner = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.ownerTeam] = (acc[node.ownerTeam] ?? 0) + 1;
    return acc;
  }, {});

  const byIntent = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.intent] = (acc[node.intent] ?? 0) + 1;
    return acc;
  }, {});

  const byPersona = nodes.reduce<Record<string, number>>((acc, node) => {
    for (const persona of node.personas) {
      acc[persona] = (acc[persona] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    total: nodes.length,
    byOwner,
    byIntent,
    byPersona,
  };
};

export const scoreIntentFit = (node: TaggedCommandNode, priorities: ForgeNodePriority): number => {
  const base = priorities[node.id] ?? 50;
  const personaBonus = node.personas.reduce((acc, persona) => {
    if (persona === 'automation') {
      return acc + 8;
    }
    if (persona === 'operator') {
      return acc + 4;
    }
    return acc + 2;
  }, 0);
  const commandTypePenalty = node.commandType.includes('validate') ? 2 : 0;
  return Math.round(base + personaBonus + node.resourceTags.length * 1.5 + commandTypePenalty);
};

export const rankTaggedNodes = (nodes: readonly TaggedCommandNode[], priorities: ForgeNodePriority): readonly TaggedCommandNode[] =>
  [...nodes].sort((left, right) => scoreIntentFit(right, priorities) - scoreIntentFit(left, priorities));

export const foldTopology = (topologies: readonly ForgeTopology[]): ForgeNodePriority => {
  const ordered = topologies.flatMap((topology) => topology.nodes);
  return Object.fromEntries(
    ordered.map((state, index) => {
      const score = Math.max(1, 100 - index);
      return [state.node.id, score];
    }),
  ) as ForgeNodePriority;
};

export const buildCommandEnvelope = (
  profile: CommandProfile,
  scenario: ForgeScenario,
  nodes: readonly ForgeNode[],
): CommandEnvelope => {
  const tagged = nodes.map((node, index) =>
    tagCommandNode(
      node,
      profile.tenant,
      index % 2 === 0 ? 'automation' : 'operator',
    ),
  );

  return {
    tenant: profile.tenant,
    profile,
    scenario,
    nodes: tagged,
  };
};
