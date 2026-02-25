export type VertexId = `vertex:${string}`;
export type EdgeId = `edge:${string}`;

export interface TopologyVertex {
  readonly id: VertexId;
  readonly label: string;
  readonly metadata: Record<string, unknown>;
}

export interface TopologyEdge {
  readonly id: EdgeId;
  readonly from: VertexId;
  readonly to: VertexId;
  readonly weight: number;
}

export type TopologyMap<TMap extends Record<string, readonly string[]>> = {
  [K in keyof TMap & string]: {
    readonly id: `node:${K}`;
    readonly outgoing: TMap[K];
    readonly incoming: readonly string[];
  };
};

export const normalizeVertexId = (value: string): VertexId => `vertex:${value}` as VertexId;
export const buildVertexMap = (vertices: readonly TopologyVertex[]): TopologyMap<Record<string, readonly string[]>> => {
  const output: Record<string, { id: string; outgoing: string[]; incoming: string[] }> = {};

  for (const vertex of vertices) {
    const id = String(vertex.id).replace('vertex:', '');
    output[id] = { id: String(vertex.id), outgoing: [], incoming: [] };
  }

  return output as unknown as TopologyMap<Record<string, readonly string[]>>;
};

export const linkTopology = <TMap extends Record<string, readonly string[]>>(
  topology: TopologyMap<TMap>,
  edges: readonly TopologyEdge[],
): TopologyMap<TMap> => {
  const result: Record<string, { id: string; outgoing: string[]; incoming: string[] }> = {};

  for (const [node, descriptor] of Object.entries(topology)) {
    result[node] = { id: descriptor.id as string, outgoing: [...descriptor.outgoing], incoming: [...descriptor.incoming] };
  }

  for (const edge of edges) {
    const source = String(edge.from).replace('vertex:', '');
    const target = String(edge.to).replace('vertex:', '');

    result[source] ??= { id: String(edge.from), outgoing: [], incoming: [] };
    result[target] ??= { id: String(edge.to), outgoing: [], incoming: [] };
    result[source].outgoing.push(target);
    result[target].incoming.push(source);
  }

  return result as unknown as TopologyMap<TMap>;
};

export const walkTopology = <TMap extends Record<string, readonly string[]>>(
  topology: TopologyMap<TMap>,
  entryPoint: keyof TMap & string,
): readonly string[] => {
  const output: string[] = [];
  const queue = [entryPoint];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || output.includes(current)) {
      continue;
    }
    output.push(current);
    for (const next of topology[current]?.outgoing ?? []) {
      queue.push(String(next));
    }
  }

  return output;
};
