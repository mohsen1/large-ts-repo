import {
  createEdgeId,
  createNodeId,
  createOutputWithPayload,
  type IntentGraphId,
  type IntentNodeConfig,
  type IntentNodeId,
  type IntentNodePayload,
  type IntentOutput,
  type IntentPolicy,
  type IntentRunId,
  type IntentStage,
  type IntentTelemetry,
  type IntentInput,
  type PluginContract,
} from './types';

type StageTuple<T extends readonly IntentStage[]> = T extends readonly [infer Head extends IntentStage, ...infer Rest extends IntentStage[]]
  ? [Head, ...StageTuple<Rest>]
  : [];

type Edge = Readonly<{
  from: IntentNodeId;
  to: IntentNodeId;
  edgeId: ReturnType<typeof createEdgeId>;
  latencyBudgetMs: number;
}>;

type Path<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [Head, ...Path<Rest>]
  : [];

const toArray = <T>(values: Iterable<T>): readonly T[] =>
  (globalThis as { readonly Iterator?: { readonly from?: <V>(value: Iterable<V>) => { toArray: () => V[] } } }).Iterator?.from?.(
    values,
  )?.toArray() ??
  Array.from(values);

export type Adjacency = ReadonlyMap<IntentNodeId, readonly Edge[]>;

export class IntentGraph {
  readonly #id: IntentGraphId;
  readonly #nodes = new Map<IntentNodeId, IntentNodeConfig>();
  readonly #edges = new Map<IntentNodeId, readonly Edge[]>();
  readonly #incoming = new Map<IntentNodeId, Set<IntentNodeId>>();

  constructor(id: IntentGraphId) {
    this.#id = id;
  }

  get id(): IntentGraphId {
    return this.#id;
  }

  addNode(node: Omit<IntentNodeConfig, 'graphId' | 'nodeId' | 'stageLabel'>): IntentNodeId {
    const nodeId = createNodeId(this.#id, `${node.kind}:${node.payload.weight}`);
    if (this.#nodes.has(nodeId)) {
      throw new Error(`duplicate node ${String(nodeId)}`);
    }

    const config: IntentNodeConfig = {
      ...node,
      graphId: this.#id,
      nodeId,
      stageLabel: `${node.kind.toUpperCase()}_STAGE` as IntentNodeConfig['stageLabel'],
    };

    this.#nodes.set(nodeId, config);
    this.#edges.set(nodeId, []);
    this.#incoming.set(nodeId, new Set());
    return nodeId;
  }

  connect(from: IntentNodeId, to: IntentNodeId, latencyBudgetMs = 250): this {
    if (!this.#nodes.has(from) || !this.#nodes.has(to)) {
      throw new Error(`connect failed for missing ${String(from)} -> ${String(to)}`);
    }

    const nextEdges = [...(this.#edges.get(from) ?? []), {
      from,
      to,
      edgeId: createEdgeId(from, to),
      latencyBudgetMs,
    }];
    this.#edges.set(from, nextEdges);
    this.#incoming.get(to)?.add(from);
    return this;
  }

  nodes(): readonly IntentNodeId[] {
    return [...this.#nodes.keys()];
  }

  edges(): readonly Edge[] {
    return toArray(this.#edges.values()).flatMap((list) => [...list]);
  }

  adjacencyList(): Adjacency {
    return new Map(this.#edges.entries()) as Adjacency;
  }

  roots(): readonly IntentNodeId[] {
    return this.nodes().filter((node) => (this.#incoming.get(node)?.size ?? 0) === 0);
  }

  *traverse(start: IntentNodeId = this.roots()[0] as IntentNodeId): IterableIterator<IntentNodeId> {
    if (!start || !this.#nodes.has(start)) {
      return;
    }

    const queue: IntentNodeId[] = [start];
    const seen = new Set<IntentNodeId>([start]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      yield current;

      for (const edge of toArray(this.#edges.get(current) ?? [])) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }

  hasCycle(): boolean {
    const seen = new Set<IntentNodeId>();
    const recursion = new Set<IntentNodeId>();

    const walk = (node: IntentNodeId): boolean => {
      if (recursion.has(node)) return true;
      if (seen.has(node)) return false;
      seen.add(node);
      recursion.add(node);

      for (const edge of this.#edges.get(node) ?? []) {
        if (walk(edge.to)) return true;
      }

      recursion.delete(node);
      return false;
    };

    return this.nodes().some((node) => walk(node));
  }

  pathFrom(start: IntentNodeId, end: IntentNodeId): Path<[IntentNodeId, ...IntentNodeId[]]> {
    const queue: Array<{ node: IntentNodeId; path: IntentNodeId[] }> = [{ node: start, path: [start] }];
    const seen = new Set<IntentNodeId>([start]);

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        continue;
      }
      if (item.node === end) {
        return item.path as Path<[IntentNodeId, ...IntentNodeId[]]>;
      }

      for (const edge of this.#edges.get(item.node) ?? []) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push({ node: edge.to, path: [...item.path, edge.to] });
        }
      }
    }

    return [start] as Path<[IntentNodeId, ...IntentNodeId[]]>;
  }

  toTelemetry(runId: IntentRunId, input: IntentInput): readonly IntentTelemetry[] {
    return toArray(this.traverse()).map((nodeId, index) => {
      const offset = (index + 1) * 97;
      return {
        runId,
        graphId: input.graphId,
        nodeId,
        tenant: input.tenant,
        elapsedMs: offset,
        stageTimings: {
          capture: nodeId.includes('capture') ? offset : 0,
          normalize: nodeId.includes('normalize') ? offset : 0,
          score: nodeId.includes('score') ? offset : 0,
          recommend: nodeId.includes('recommend') ? offset : 0,
          simulate: nodeId.includes('simulate') ? offset : 0,
          resolve: nodeId.includes('resolve') ? offset : 0,
        },
      };
    });
  }

  toOutcome(runId: IntentRunId, input: IntentInput): {
    runId: IntentRunId;
    graphId: IntentGraphId;
    tenant: IntentInput['tenant'];
    ok: boolean;
    confidence: number;
    recommendations: readonly string[];
  } {
    const steps = this.nodes().length;
    return {
      runId,
      graphId: input.graphId,
      tenant: input.tenant,
      ok: steps > 0,
      confidence: Math.min(1, 0.15 + steps * 0.1),
      recommendations: this.nodes().map((nodeId) => `node:${nodeId}`),
    };
  }

  toPolicy<TCatalog extends readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>(
    policyId: IntentGraphId,
    tenant: IntentPolicy<TCatalog>['tenant'],
    channel: IntentPolicy<TCatalog>['channel'],
    plugins: TCatalog,
  ): IntentPolicy<TCatalog> {
    return {
      id: policyId,
      tenant,
      channel,
      steps: this.nodes().map((nodeId) => this.#nodes.get(nodeId)?.kind ?? 'capture'),
      plugins,
    };
  }
}

export const buildGraphFromPolicy = <TCatalog extends readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>(
  policy: IntentPolicy<TCatalog>,
): IntentGraph => {
  const intentGraph = new IntentGraph(policy.id);
  const nodes = policy.steps.map((kind, index) =>
    intentGraph.addNode({
      kind,
      payload: { kind, weight: index + 1 },
      timeoutMs: 500,
      retries: 1,
      metadata: {
        owner: `operator:${policy.tenant}` as any,
        createdAt: new Date(),
        labels: [policy.channel],
        labelsByStage: {
          capture: [policy.channel],
          normalize: [policy.channel],
          score: [policy.channel],
          recommend: [policy.channel],
          simulate: [policy.channel],
          resolve: [policy.channel],
        },
      },
    }),
  );

  for (let index = 0; index < nodes.length - 1; index += 1) {
    intentGraph.connect(nodes[index], nodes[index + 1], 300 + index * 20);
  }

  return intentGraph;
};

export const buildGraphFromStageSequence = <
  TStages extends readonly IntentStage[],
  TCatalog extends readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[],
>(
  policyId: IntentGraphId,
  tenant: IntentPolicy<TCatalog>['tenant'],
  channel: IntentPolicy<TCatalog>['channel'],
  steps: StageTuple<TStages>,
  plugins: TCatalog,
): IntentGraph => {
  const policy: IntentPolicy<TCatalog> = {
    id: policyId,
    tenant,
    channel,
    steps: steps as readonly IntentStage[],
    plugins,
  };
  return buildGraphFromPolicy(policy);
};

export const estimateComplexity = (graph: IntentGraph): {
  nodes: number;
  edges: number;
  hasCycle: boolean;
  width: number;
} => {
  const nodes = graph.nodes();
  const edges = graph.edges();
  return {
    nodes: nodes.length,
    edges: edges.length,
    hasCycle: graph.hasCycle(),
    width: nodes.filter(Boolean).length,
  };
};

export const toOutputSamples = (
  policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>,
  runId: IntentRunId,
  input: IntentInput,
  index: number,
  total: number,
): IntentOutput => {
  const output = createOutputWithPayload(
    {
      input: {
        ...input,
        runId,
      },
      nodeId: createNodeId(policy.id, `${index}`),
      payload: {
        kind: policy.steps[index % policy.steps.length] ?? 'capture',
        weight: index + 1,
      },
      recommendations: [`stage:${index}`, `total:${total}`],
    },
    100 - index * 5,
    123 + index * 13,
  );
  return output.ok ? output.output : {
    runId,
    graphId: policy.id,
    tenant: input.tenant,
    nodeId: createNodeId(policy.id, `${index}`),
    score: 0,
    elapsedMs: 0,
    recommendations: ['fallback'],
  };
};

export { toArray, type Path };
