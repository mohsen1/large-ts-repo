import { randomUUID } from 'node:crypto';
import { withBrand, normalizeLimit } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import {
  type MeshNodeConfig,
  type MeshTopology,
  type MeshTopologyEdge,
  type MeshTopologyPath,
  type MeshNodeId,
  type MeshPlanId,
} from './types';

export type MeshProfileMode = 'steady' | 'burst' | 'noisy' | 'recover';
export type MeshTopologyProfileId = string & { readonly __brand: 'MeshTopologyProfileId' };

export type ProfileTemplate<TMode extends MeshProfileMode = MeshProfileMode> = {
  readonly mode: TMode;
  readonly namespace: `mesh.profile.${TMode}`;
};

export interface ProfileRule {
  readonly id: MeshTopologyProfileId;
  readonly topologyId: MeshPlanId;
  readonly mode: MeshProfileMode;
  readonly labels: readonly string[];
  readonly createdAt: number;
  readonly score: number;
}

export interface ProfilePolicy<TNode extends MeshNodeConfig = MeshNodeConfig> {
  readonly nodeKind: TNode['kind'];
  readonly maxConcurrency: number;
  readonly canMutate: boolean;
  readonly weight: number;
}

export interface ProfileAnalysis {
  readonly nodes: number;
  readonly links: number;
  readonly score: number;
  readonly scoreByEdge: Record<string, number>;
}

export type ProfilePolicyMap<TNodes extends readonly MeshNodeConfig[]> = {
  [Node in TNodes[number] as Node['kind']]: ProfilePolicy<Node>;
};

export const inferProfileMode = <T extends string>(mode: T): T extends MeshProfileMode ? T : MeshProfileMode => {
  if (mode === 'steady' || mode === 'burst' || mode === 'noisy' || mode === 'recover') {
    return mode as T extends MeshProfileMode ? T : MeshProfileMode;
  }
  return 'steady' as T extends MeshProfileMode ? T : MeshProfileMode;
};

export interface TopologyProfile<TTopology extends MeshTopology = MeshTopology> {
  readonly id: MeshTopologyProfileId;
  readonly mode: MeshProfileMode;
  readonly topologyId: MeshPlanId;
  readonly topology: TTopology;
  readonly policy: ProfilePolicyMap<TTopology['nodes'][number][] extends readonly MeshNodeConfig[] ? TTopology['nodes'] : never>;
}

export const createPolicyFromNode = <TNode extends MeshNodeConfig>(
  node: TNode,
  index: number,
): ProfilePolicy<TNode> => ({
  nodeKind: node.kind,
  maxConcurrency: node.maxConcurrency + (index % 2),
  canMutate: node.kind !== 'observer',
  weight: Math.max(1, node.maxConcurrency + index),
});

const edgeDensity = (edges: readonly MeshTopologyEdge[]): number =>
  edges.length === 0
    ? 0
    : edges.reduce((acc, edge) => acc + (edge.weight || 1), 0) / Math.max(1, edges.length);

const labelFromNode = (nodeId: MeshNodeId, mode: MeshProfileMode): string => `label-${mode}-${nodeId}`;

export const analyzeTopology = <TTopology extends MeshTopology>(topology: NoInfer<TTopology>): ProfileAnalysis => {
  const labels = new Set<string>();
  const scoreByEdge = topology.links.reduce(
    (acc, edge) => {
      const key = `${edge.from}->${edge.to}`;
      const value = (acc[key] ?? 0) + edge.retryLimit + edge.channels.length;
      acc[key] = value;
      labels.add(key);
      return acc;
    },
    {} as Record<string, number>,
  );

  const profileScore = Object.values(scoreByEdge).reduce((acc, item) => acc + item, 0);

  return {
    nodes: topology.nodes.length,
    links: topology.links.length,
    score: Number((profileScore / Math.max(1, topology.links.length)).toFixed(4)),
    scoreByEdge,
  };
};

export const sortPolicyLabels = (labels: readonly string[]): readonly string[] =>
  labels
    .map((label) => label.toLowerCase())
    .toSorted()
    .toReversed()
    .toSorted()
    .map((entry) => entry.toUpperCase());

export class MeshTopologyProfileBuilder<TTopology extends MeshTopology> {
  readonly #mode: MeshProfileMode;
  readonly #topology: TTopology;
  readonly #policy: Map<string, ProfilePolicy>;

  constructor(topology: NoInfer<TTopology>, mode: MeshProfileMode) {
    this.#topology = topology;
    this.#mode = mode;
    this.#policy = new Map(
      topology.nodes.map((node, index) => [
        node.id,
        {
          nodeKind: node.kind,
          maxConcurrency: Math.max(1, node.maxConcurrency + index),
          canMutate: mode !== 'steady',
          weight: this.weight(node.id, mode),
        },
      ]),
    );
  }

  get mode() {
    return this.#mode;
  }

  get id() {
    return withBrand(`mesh-profile-${this.#topology.id}-${this.#mode}`, 'MeshTopologyProfileId');
  }

  get policy() {
    return new Map(this.#policy);
  }

  build = (): TopologyProfile<TTopology> => ({
    id: this.id,
    mode: this.#mode,
    topologyId: this.#topology.id,
    topology: this.#topology,
    policy: this.policy as unknown as ProfilePolicyMap<
      TTopology['nodes'][number][] extends readonly MeshNodeConfig[] ? TTopology['nodes'] : never
    >,
  });

  routes = (): readonly MeshTopologyPath[] => {
    const map = new Set<MeshTopologyPath>();
    for (const edge of this.#topology.links) {
      map.add(`${edge.from}` as MeshTopologyPath);
      map.add(`${edge.to}` as MeshTopologyPath);
    }
    return [...map].toSorted();
  };

  labels = (): readonly string[] => {
    return this.#topology.nodes.map((node) => labelFromNode(node.id, this.#mode)).toSorted();
  };

  private weight(nodeId: MeshNodeId, mode: MeshProfileMode): number {
    const base = mode === 'burst' ? 3 : mode === 'noisy' ? 2 : mode === 'recover' ? 4 : 1;
    const seed = Number(nodeId.slice(0, 2));
    return Number.isFinite(seed) ? base + (seed % 4) : base;
  }
}

export const createTopologyProfile = <TTopology extends MeshTopology>(
  topology: NoInfer<TTopology>,
  mode: MeshProfileMode,
): TopologyProfile<TTopology> => {
  const builder = new MeshTopologyProfileBuilder(topology, inferProfileMode(mode));
  return builder.build();
};

export const mergeProfiles = <T extends readonly TopologyProfile[]>(
  profiles: NoInfer<T>,
  includeMode: MeshProfileMode,
): readonly TopologyProfile[] => {
  const score = profiles.length === 0 ? 0 : profiles.map((profile) => profile.mode).filter((mode) => mode === includeMode).length;
  return profiles
    .filter((profile) => profile.mode === includeMode || score === 0)
    .toSorted((left, right) => Number(right.topologyId > left.topologyId) - 1);
};

export const randomProfileId = (seed: string): MeshTopologyProfileId =>
  withBrand(`mesh-profile-${seed}-${randomUUID()}`, 'MeshTopologyProfileId');

export const planFromProfile = (profile: TopologyProfile, suffix: number): readonly MeshTopologyPath[] => {
  const capacity = normalizeLimit(profile.topology.nodes.length + suffix);
  const labels = profile.topology.nodes
    .map((node) => labelFromNode(node.id, profile.mode))
    .toSorted()
    .slice(-capacity);

  return labels.toSorted().map((label) => `${label}:${suffix}` as MeshTopologyPath);
};
