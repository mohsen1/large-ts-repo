import type { MeshEdge, MeshNode, MeshPhase } from './mesh-types';

export type RuntimeGraphAdjacency<TNodes extends string = string> = {
  [nodeId in TNodes]: ReadonlyArray<TNodes>;
};

export type RuntimePath<T extends readonly MeshNode[]> = {
  readonly head: T[0];
  readonly tail: T extends readonly [infer Head, ...infer Rest] ? Rest : readonly [];
};

export type EdgeByPhase<T extends readonly MeshEdge[]> = {
  [K in MeshPhase]?: T;
};

interface RuntimeBuildError {
  readonly type: 'cycle' | 'disconnected' | 'invalid' | 'empty';
  readonly nodeCount: number;
  readonly message: string;
}

export interface RuntimeGraphSnapshot {
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly adjacency: RuntimeGraphAdjacency<string>;
  readonly cycles: readonly string[][];
  readonly warnings: readonly string[];
}

const isSelfLoop = (edge: MeshEdge): boolean => edge.from === edge.to;

const collectNeighbors = (edges: readonly MeshEdge[], from: MeshNode['id']): readonly MeshNode['id'][] =>
  edges.filter((edge) => edge.from === from).map((edge) => edge.to);

const collectWarnings = (
  nodes: readonly MeshNode[],
  edges: readonly MeshEdge[],
): { warnings: string[]; adjacency: RuntimeGraphAdjacency<string> } => {
  const adjacency: { [nodeId: string]: ReadonlyArray<MeshNode['id']> } = {};

  for (const node of nodes) {
    adjacency[node.id] = [...collectNeighbors(edges, node.id)];
  }

  const warnings = nodes
    .filter((node) => node.score < 0 || node.score > 1)
    .map((node) => `node-score:${node.id}`);

  if (warnings.length === 0) {
    const missing = edges.filter((edge) => !adjacency[edge.from] || !adjacency[edge.from]!.includes(edge.to));
    for (const edge of missing) {
      warnings.push(`dangling:${edge.from}->${edge.to}`);
    }
  }

  return { warnings, adjacency: adjacency as RuntimeGraphAdjacency<string> };
};

const detectCyclesInternal = (adjacency: RuntimeGraphAdjacency<string>): readonly string[][] => {
  const nodes = Object.keys(adjacency);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (current: string): void => {
    if (visited.has(current)) return;
    if (visiting.has(current)) return;

    visiting.add(current);
    stack.push(current);

    for (const next of adjacency[current] ?? []) {
      if (!visiting.has(next)) {
        dfs(next);
        continue;
      }
      const index = stack.indexOf(next);
      if (index >= 0) {
        cycles.push(stack.slice(index));
      }
    }

    const popped = stack.at(-1);
    if (popped !== undefined) {
      stack.splice(stack.indexOf(popped), 1);
    }
    visiting.delete(current);
    visited.add(current);
  };

  for (const node of nodes) {
    dfs(node);
  }

  return Object.freeze(cycles);
};

export const buildRuntimeGraph = (
  nodes: readonly MeshNode[],
  edges: readonly MeshEdge[],
): RuntimeGraphSnapshot | RuntimeBuildError => {
  const sanitizedNodes = nodes.toSorted((left, right) => left.id.localeCompare(right.id));
  const sanitizedEdges = edges.filter((edge) => !isSelfLoop(edge));

  if (sanitizedNodes.length === 0) {
    return {
      type: 'empty',
      nodeCount: 0,
      message: 'runtime graph requires nodes',
    };
  }

  const { warnings, adjacency } = collectWarnings(sanitizedNodes, sanitizedEdges);
  const cycles = detectCyclesInternal(adjacency);
  if (cycles.length > 0) {
    return {
      type: 'cycle',
      nodeCount: sanitizedNodes.length,
      message: `cycle-detected:${cycles.length}`,
    };
  }

  if (warnings.length > 0) {
    return {
      type: 'disconnected',
      nodeCount: sanitizedNodes.length,
      message: warnings.join('|'),
    };
  }

  return {
    nodes: Object.freeze(sanitizedNodes),
    edges: Object.freeze(sanitizedEdges),
    adjacency: Object.freeze(adjacency),
    cycles: Object.freeze([]),
    warnings: Object.freeze([]),
  };
};

export const mapByPhase = <TEdges extends readonly MeshEdge[]>(edges: TEdges): EdgeByPhase<TEdges> =>
  edges.reduce<EdgeByPhase<TEdges>>(
    (acc, edge) => {
      const key = edge.to.split(':')[1] as MeshPhase;
      const phaseEdges = (acc[key] ?? []) as TEdges;
      return {
        ...acc,
        [key]: Object.freeze([...phaseEdges, edge]),
      };
    },
    {},
  );

export const graphSignature = (nodes: readonly MeshNode[], edges: readonly MeshEdge[]): string =>
  `${nodes.length}/${edges.length}/${nodes.map((node) => node.id).join(',')}`.toLowerCase();
