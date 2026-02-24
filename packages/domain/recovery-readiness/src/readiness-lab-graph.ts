import type { Brand } from '@shared/type-level';
import type { ReadinessLabStep, ReadinessLabStepPayload, ReadinessLabStepPath, ReadinessLabRunId } from './readiness-lab-core';

export type ReadinessLabNodeId = Brand<string, 'ReadinessLabNodeId'>;
export type ReadinessLabEdgeId = Brand<string, 'ReadinessLabEdgeId'>;

export interface ReadinessLabNode<TStep extends ReadinessLabStep, TPayload = unknown> {
  readonly id: ReadinessLabNodeId;
  readonly runId: ReadinessLabRunId;
  readonly step: TStep;
  readonly path: ReadinessLabStepPath<TStep>;
  readonly payload: TPayload;
  readonly dependencies: ReadonlyArray<ReadinessLabNodeId>;
  readonly createdAt: string;
}

export interface ReadinessLabEdge {
  readonly id: ReadinessLabEdgeId;
  readonly from: ReadinessLabNodeId;
  readonly to: ReadinessLabNodeId;
  readonly fromStep: ReadinessLabStep;
  readonly toStep: ReadinessLabStep;
  readonly reason: string;
}

export interface ReadinessLabGraphSnapshot {
  readonly runId: ReadinessLabRunId;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly byStep: Record<ReadinessLabStep, number>;
  readonly pathTrail: readonly string[];
}

export type ReadinessLabGraphTuple<TSteps extends readonly ReadinessLabStep[]> = TSteps extends readonly [
  infer Head extends ReadinessLabStep,
  ...infer Tail extends ReadinessLabStep[],
]
  ? readonly [ReadinessLabNode<Head>, ...ReadinessLabGraphTuple<Tail>]
  : readonly [];

export type ReadinessLabAdjacency<TNodes extends ReadonlyArray<ReadinessLabNode<ReadinessLabStep, unknown>>> =
  TNodes extends readonly [infer Head, ...infer Rest]
    ? Head extends ReadinessLabNode<infer TStep, infer TPayload>
      ? ReadonlyMap<Head['id'], ReadonlyArray<ReadinessLabNodeId>> & { [K in Head['id']]: ReadonlyArray<ReadinessLabNodeId> }
      : never
    : ReadonlyMap<string, ReadinessLabNodeId[]>;

const createNodeId = (runId: ReadinessLabRunId, step: ReadinessLabStep, order: number): ReadinessLabNodeId =>
  `${runId}:${step}:${order}` as ReadinessLabNodeId;
const createEdgeId = (from: ReadinessLabNodeId, to: ReadinessLabNodeId): ReadinessLabEdgeId =>
  `${from}->${to}` as ReadinessLabEdgeId;

const makeSeedPayload = (step: ReadinessLabStep, index: number): ReadinessLabStepPayload<ReadinessLabStep> => {
  const seedContext = { index, phase: `${step}:${index}` };
  const defaults = {
    discover: { discoveredSignals: index },
    triage: { triagedSignals: index },
    validate: { violatedSignals: index },
    simulate: { scenarioCount: index },
    execute: { executedActions: index },
    review: { reviewedSignals: index },
  } as const;

  return {
    step,
    context: seedContext,
    payload: defaults[step],
    score: index + 1,
  };
};

const normalizePayload = (step: ReadinessLabStep, index: number, fallback: Readonly<Record<string, unknown>> | undefined) => {
  const seed = makeSeedPayload(step, index);
  if (!fallback) {
    return seed;
  }

  return {
    ...seed,
    payload: {
      ...seed.payload,
      fallback,
    },
    context: {
      ...seed.context,
      fallback,
    },
  };
};

export class ReadinessLabGraph<TSteps extends readonly ReadinessLabStep[] = ReadinessLabStep[]> {
  readonly #nodes = new Map<ReadinessLabNodeId, ReadinessLabNode<ReadinessLabStep, unknown>>();
  readonly #edges = new Map<ReadinessLabEdgeId, ReadinessLabEdge>();
  readonly #runId: ReadinessLabRunId;
  readonly #path: string[];

  constructor(
    runId: ReadinessLabRunId,
    private readonly steps: ReadonlyArray<ReadinessLabStep>,
    private readonly payloads: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ) {
    this.#runId = runId;
    this.#path = steps.map((step) => `${step}-seed`);
    this.seedGraph();
  }

  [Symbol.iterator](): IterableIterator<ReadinessLabNode<ReadinessLabStep, unknown>> {
    return this.nodes.values();
  }

  get runId(): ReadinessLabRunId {
    return this.#runId;
  }

  get nodes(): ReadonlyMap<ReadinessLabNodeId, ReadinessLabNode<ReadinessLabStep, unknown>> {
    return this.#nodes;
  }

  get edges(): ReadonlyMap<ReadinessLabEdgeId, ReadinessLabEdge> {
    return this.#edges;
  }

  get pathTrail(): readonly string[] {
    return this.#path;
  }

  private seedGraph(): void {
    const created: ReadinessLabNode<ReadinessLabStep, unknown>[] = this.steps.map((step, index) => {
      const payload = normalizePayload(step, index, this.payloads[index]);
      const previous = index > 0 ? this.steps[index - 1] : undefined;
      return {
        id: createNodeId(this.runId, step, index),
        runId: this.runId,
        step,
        path: `${step}/${index}` as ReadinessLabStepPath<typeof step>,
        payload: payload as Readonly<Record<string, unknown>>,
        dependencies: previous ? [createNodeId(this.runId, previous, index - 1)] : [],
        createdAt: new Date().toISOString(),
      };
    });

    for (const node of created) {
      this.#nodes.set(node.id, node);
    }

    for (let index = 1; index < created.length; index += 1) {
      const previous = created[index - 1];
      const current = created[index];
      if (!previous || !current) {
        continue;
      }

      const edgeId = createEdgeId(previous.id, current.id);
      this.#edges.set(edgeId, {
        id: edgeId,
        from: previous.id,
        to: current.id,
        fromStep: previous.step,
        toStep: current.step,
        reason: `${previous.step}->${current.step}`,
      });
    }
  }

  addNode<TPayload>(input: {
    step: ReadinessLabStep;
    order: number;
    payload: TPayload;
    dependencies?: ReadonlyArray<ReadinessLabNodeId>;
  }): ReadinessLabNode<ReadinessLabStep, TPayload> {
    const node: ReadinessLabNode<ReadinessLabStep, TPayload> = {
      id: createNodeId(this.runId, input.step, input.order),
      runId: this.runId,
      step: input.step,
      path: `${input.step}/${input.order}` as ReadinessLabStepPath<ReadinessLabStep>,
      payload: input.payload,
      dependencies: input.dependencies ?? [],
      createdAt: new Date().toISOString(),
    };

    if (this.#nodes.has(node.id)) {
      throw new Error(`duplicate-node:${node.id}`);
    }

    this.#nodes.set(node.id, node);
    this.#path.push(node.path);
    return node;
  }

  addDependency(from: ReadinessLabNodeId, to: ReadinessLabNodeId, reason: string): ReadinessLabEdge {
    if (!this.#nodes.has(from) || !this.#nodes.has(to)) {
      throw new Error(`invalid-edge:${from}:${to}`);
    }

    const edge: ReadinessLabEdge = {
      id: createEdgeId(from, to),
      from,
      to,
      fromStep: this.#nodes.get(from)?.step ?? 'discover',
      toStep: this.#nodes.get(to)?.step ?? 'discover',
      reason,
    };

    this.#edges.set(edge.id, edge);
    return edge;
  }

  snapshot(): ReadinessLabGraphSnapshot {
    const byStep: Record<ReadinessLabStep, number> = {
      discover: 0,
      triage: 0,
      validate: 0,
      simulate: 0,
      execute: 0,
      review: 0,
    };

    for (const node of this.nodes.values()) {
      byStep[node.step] = byStep[node.step] + 1;
    }

    return {
      runId: this.runId,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      byStep,
      pathTrail: this.pathTrail,
    };
  }

  topological(): ReadonlyArray<ReadinessLabNode<ReadinessLabStep, unknown>> {
    const indegree = new Map<ReadinessLabNodeId, number>();
    const outgoing = new Map<ReadinessLabNodeId, ReadonlyArray<ReadinessLabNodeId>>();

    for (const node of this.nodes.values()) {
      indegree.set(node.id, node.dependencies.length);
    }

    for (const edge of this.edges.values()) {
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    }

    const queue = [...this.nodes.values()].filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
    const ordered: ReadinessLabNode<ReadinessLabStep, unknown>[] = [];

    while (queue.length > 0) {
      const nextNodeId = queue.shift();
      if (!nextNodeId) {
        continue;
      }

      const node = this.nodes.get(nextNodeId);
      if (!node) {
        continue;
      }
      ordered.push(node);

      const children = outgoing.get(nextNodeId) ?? [];
      for (const child of children) {
        const next = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, next);
        if (next <= 0) {
          queue.push(child);
        }
      }
    }

    return ordered;
  }
}

