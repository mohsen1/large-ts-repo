import type { FusionTopology, FusionTopologyEdge, FusionTopologyMetrics, FusionTopologyNode } from './types';

const normalizeNodeWeight = (weight: number): number => Math.min(1, Math.max(0, Number.isFinite(weight) ? weight : 0));

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

const sortNodesByWeight = (nodes: readonly FusionTopologyNode[]): readonly FusionTopologyNode[] =>
  [...nodes].sort((a, b) => {
    const diff = b.weight - a.weight;
    if (diff !== 0) {
      return diff;
    }
    return a.id.localeCompare(b.id);
  });

const collectNeighbors = (nodes: readonly FusionTopologyNode[], id: string): readonly string[] =>
  nodes
    .filter((node) => node.id === id)
    .flatMap((node) => [...node.children, ...node.parents]);

const buildLookup = (nodes: readonly FusionTopologyNode[]): Record<string, FusionTopologyNode> =>
  nodes.reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {} as Record<string, FusionTopologyNode>);

const safeMean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const edgeCountByNode = (nodes: readonly FusionTopologyNode[], edges: readonly FusionTopologyEdge[]) =>
  nodes.reduce<Record<string, number>>((acc, node) => {
    const incoming = edges.filter((edge) => edge.to === node.id).length;
    const outgoing = edges.filter((edge) => edge.from === node.id).length;
    acc[node.id] = incoming + outgoing;
    return acc;
  }, {});

const pathLength = (graph: Record<string, readonly string[]>, from: string, to: string): number => {
  if (from === to) {
    return 0;
  }

  const visited = new Set<string>([from]);
  const queue: Array<{ node: string; depth: number }> = [{ node: from, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const nextDepth = current.depth + 1;
    const neighbors = graph[current.node] ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      if (neighbor === to) {
        return nextDepth;
      }
      visited.add(neighbor);
      queue.push({ node: neighbor, depth: nextDepth });
    }
  }

  return Number.POSITIVE_INFINITY;
};

export const normalizeTopology = (topology: FusionTopology): FusionTopology => {
  const lookup = buildLookup(topology.nodes);
  const nodes = topology.nodes.map<FusionTopologyNode>((node) => {
    const children = unique(node.children.map((child) => child.trim()).filter(Boolean));
    const parents = unique(node.parents.map((parent) => parent.trim()).filter(Boolean));
    return {
      ...node,
      label: node.label.trim(),
      weight: normalizeNodeWeight(node.weight),
      children,
      parents,
    };
  });

  return {
    nodes: sortNodesByWeight(nodes),
    edges: topology.edges
      .map((edge) => {
        const fromExists = !!lookup[edge.from];
        const toExists = !!lookup[edge.to];
        if (!fromExists || !toExists) {
          return undefined;
        }
        const latencyMs = Math.max(1, edge.latencyMs);
        const riskPenalty = Math.max(0, edge.riskPenalty);
        return {
          ...edge,
          latencyMs,
          riskPenalty,
        };
      })
      .filter((edge): edge is FusionTopologyEdge => edge !== undefined),
  };
};

const extractDensityScore = (nodes: readonly FusionTopologyNode[], edges: readonly FusionTopologyEdge[]): number => {
  const nodeCount = Math.max(1, nodes.length);
  const maxEdges = nodeCount * Math.max(1, nodeCount - 1);
  return Math.min(1, edges.length / maxEdges);
};

const extractCentrality = (nodes: readonly FusionTopologyNode[], edges: readonly FusionTopologyEdge[]): readonly string[] => {
  const counts = edgeCountByNode(nodes, edges);
  const ranked = [...nodes]
    .map((node) => ({ id: node.id, centrality: counts[node.id] ?? 0 }))
    .sort((a, b) => {
      if (b.centrality === a.centrality) {
        return a.id.localeCompare(b.id);
      }
      return b.centrality - a.centrality;
    });

  return ranked.slice(0, Math.min(3, ranked.length)).map((entry) => entry.id);
};

export const analyzeTopology = (topology: FusionTopology): FusionTopologyMetrics => {
  const normalized = normalizeTopology(topology);
  const graph = normalized.nodes.reduce<Record<string, readonly string[]>>((acc, node) => {
    acc[node.id] = unique(node.children);
    return acc;
  }, {});

  const averageLatencyMs = safeMean(normalized.edges.map((edge) => edge.latencyMs));
  const density = extractDensityScore(normalized.nodes, normalized.edges);

  const allPairs = normalized.nodes.flatMap((source) =>
    normalized.nodes
      .filter((target) => target.id !== source.id)
      .map((target) => pathLength(graph, source.id, target.id)),
  );

  const finitePairs = allPairs.filter((value) => value !== Number.POSITIVE_INFINITY);
  const maxPath = finitePairs.length > 0 ? Math.max(...finitePairs) : 0;

  return {
    diameter: maxPath,
    density,
    centralityHotspots: extractCentrality(normalized.nodes, normalized.edges),
    averageLatencyMs,
  };
};

export const buildDependencyOrder = (topology: FusionTopology): readonly string[] => {
  const nodeIds = new Set<string>(topology.nodes.map((node) => node.id));
  const indegree = topology.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.id] = 0;
    return acc;
  }, {});

  for (const edge of topology.edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      indegree[edge.to] = (indegree[edge.to] ?? 0) + 1;
    }
  }

  const queue = Object.entries(indegree)
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  const out = new Set<string>(collectNeighbors(topology.nodes, ''));

  const edgesByFrom = topology.edges.reduce<Record<string, readonly string[]>>((acc, edge) => {
    const next = [...(acc[edge.from] ?? []), edge.to];
    acc[edge.from] = unique(next);
    return acc;
  }, {});

  for (const current of queue) {
    const outgoing = edgesByFrom[current] ?? [];
    for (const next of outgoing) {
      out.delete(next);
      const nextCount = (indegree[next] ?? 0) - 1;
      indegree[next] = nextCount;
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  const remaining = Object.keys(indegree).filter((id) => indegree[id] > 0);
  const ordered = queue
    .concat([...out])
    .concat(remaining)
    .filter((value, index, array) => array.indexOf(value) === index);

  return ordered;
};

export const extractNeighborhood = (topology: FusionTopology, nodeId: string): readonly string[] => {
  const direct = topology.edges
    .filter((edge) => edge.from === nodeId || edge.to === nodeId)
    .map((edge) => (edge.from === nodeId ? edge.to : edge.from));

  const twoHop = direct.flatMap((id) =>
    topology.edges
      .filter((edge) => edge.from === id || edge.to === id)
      .map((edge) => (edge.from === id ? edge.to : edge.from)),
  );

  return unique([nodeId, ...direct, ...twoHop]);
};
