import type { Brand } from '@shared/core';

export type DependencyNodeState = 'new' | 'active' | 'degraded' | 'failed';

export interface ServiceDependencyNode {
  readonly id: Brand<string, 'ServiceId'>;
  readonly owner: string;
  readonly region: string;
  readonly criticality: number;
  readonly recoveredBySlaSeconds: number;
  readonly state: DependencyNodeState;
}

export interface DependencyEdge {
  readonly from: ServiceDependencyNode['id'];
  readonly to: ServiceDependencyNode['id'];
  readonly reliabilityScore: number;
  readonly isHardDependency: boolean;
}

export interface DependencyMapInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly services: readonly ServiceDependencyNode[];
  readonly edges: readonly DependencyEdge[];
  readonly generatedAt: string;
}

export interface DependencyRank {
  readonly nodeId: ServiceDependencyNode['id'];
  readonly depth: number;
  readonly inboundCount: number;
  readonly outboundCount: number;
  readonly score: number;
}

export interface DependencyMap {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly nodes: readonly ServiceDependencyNode[];
  readonly edges: readonly DependencyEdge[];
  readonly generatedAt: string;
  readonly order: readonly ServiceDependencyNode['id'][];
  readonly ranks: readonly DependencyRank[];
  readonly hasCycle: boolean;
}

export interface CriticalPath {
  readonly nodeIds: readonly ServiceDependencyNode['id'][];
  readonly riskScore: number;
}

const rankScore = (node: ServiceDependencyNode, inCount: number, outCount: number): number => {
  const stateMultiplier = node.state === 'failed' ? 3 : node.state === 'degraded' ? 2 : 1;
  return (node.criticality * 100) / (node.recoveredBySlaSeconds || 1) * stateMultiplier + inCount * 1.5 + outCount;
};

const byNodeId = (nodes: readonly ServiceDependencyNode[]) =>
  new Map(nodes.map((node) => [node.id, node] as const));

const buildAdjacency = (
  edges: readonly DependencyEdge[],
): { readonly outgoing: Map<string, readonly string[]>; readonly incoming: Map<string, readonly string[]> } => {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const nextOut = outgoing.get(from) ?? [];
    outgoing.set(from, [...nextOut, to]);

    const nextIn = incoming.get(to) ?? [];
    incoming.set(to, [...nextIn, from]);
  }

  return {
    outgoing,
    incoming,
  };
};

const topoSortWithCycleDetection = (nodes: readonly ServiceDependencyNode[], edges: readonly DependencyEdge[]) => {
  const map = byNodeId(nodes);
  const { outgoing, incoming } = buildAdjacency(edges);
  const queue: string[] = [];

  for (const node of nodes) {
    if (!(incoming.has(String(node.id)))) {
      queue.push(String(node.id));
    }
  }

  const order: string[] = [];
  const seen = new Set<string>([]);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (seen.has(next)) continue;
    seen.add(next);
    order.push(next);

    const neighbors = outgoing.get(next) ?? [];
    for (const neighbor of neighbors) {
      const remaining = (incoming.get(neighbor) ?? []).filter((from) => from !== next);
      if (remaining.length === 0) {
        queue.push(neighbor);
      } else {
        incoming.set(neighbor, remaining);
      }
    }
  }

  const remaining = nodes.map((node) => node.id).filter((id) => !seen.has(String(id)));
  return {
    order: [...order, ...remaining.map((id) => String(id))] as string[],
    hasCycle: remaining.length > 0,
    map,
  };
};

export const buildDependencyMap = (input: DependencyMapInput): DependencyMap => {
  const { order, hasCycle, map } = topoSortWithCycleDetection(input.services, input.edges);
  const { outgoing, incoming } = buildAdjacency(input.edges);

  const ranks = input.services.map((node) => {
    const inCount = (incoming.get(String(node.id)) ?? []).length;
    const outCount = (outgoing.get(String(node.id)) ?? []).length;
    return {
      nodeId: node.id,
      depth: inCount + outCount,
      inboundCount: inCount,
      outboundCount: outCount,
      score: rankScore(node, inCount, outCount),
    };
  }).sort((left, right) => right.score - left.score);

  return {
    tenant: input.tenant,
    nodes: [...input.services].sort((left, right) => {
      return String(left.id).localeCompare(String(right.id));
    }),
    edges: [...input.edges],
    generatedAt: input.generatedAt,
    order: order.map((nodeId) => nodeId as unknown as DependencyMap['order'][number]),
    ranks,
    hasCycle,
  };
};

export const computeCriticalPath = (map: DependencyMap): CriticalPath => {
  const rankById = new Map(map.ranks.map((rank) => [rank.nodeId, rank.score] as const));
  const byScore = [...map.ranks].sort((left, right) => right.score - left.score).slice(0, 4);

  const nodes: ServiceDependencyNode['id'][] = [];
  let riskScore = 0;

  for (const rank of byScore) {
    nodes.push(rank.nodeId);
    riskScore += rank.score;
  }

  for (const id of map.order.slice(0, 2)) {
    if (!nodes.includes(id)) {
      nodes.push(id);
      const score = rankById.get(id) ?? 0;
      riskScore += score;
    }
  }

  return {
    nodeIds: nodes,
    riskScore: Number((riskScore / Math.max(1, byScore.length)).toFixed(3)),
  };
};

export const filterDependencyMap = (
  map: DependencyMap,
  states: readonly DependencyNodeState[],
): DependencyMap => {
  const nodeSet = new Set(
    map.nodes.filter((node) => states.includes(node.state)).map((node) => String(node.id)),
  );
  const nodes = map.nodes.filter((node) => nodeSet.has(String(node.id)));
  const edges = map.edges.filter((edge) =>
    nodeSet.has(String(edge.from)) && nodeSet.has(String(edge.to)),
  );

  return buildDependencyMap({
    tenant: map.tenant,
    services: nodes,
    edges,
    generatedAt: map.generatedAt,
  });
};

export const dependencyMapToSummary = (map: DependencyMap): string => {
  const parts = [
    `tenant=${map.tenant}`,
    `nodes=${map.nodes.length}`,
    `edges=${map.edges.length}`,
    `cycle=${map.hasCycle}`,
    `critical=${map.ranks[0]?.nodeId ?? 'none'}`,
  ];
  return parts.join(' | ');
};

export const nodesByRegion = (map: DependencyMap): Record<string, readonly ServiceDependencyNode['id'][]> => {
  const grouped: Record<string, ServiceDependencyNode['id'][]> = {};
  for (const node of map.nodes) {
    grouped[node.region] = [...(grouped[node.region] ?? []), node.id];
  }
  return grouped;
};
