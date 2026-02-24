import { NoInfer } from '@shared/type-level';
import { SignalLayer, SignalPriority, signalLayers, AnySignalEnvelope, signalLayers as signalLayerCatalog } from './signal-models';
import type { PluginScope } from './plugin-registry';

export const workflowStages = ['ingest', 'evaluate', 'simulate', 'synthesize', 'execute'] as const;
export type WorkflowStage = (typeof workflowStages)[number];
export type StageRoute = string;

export interface WorkflowNode<TPayload = unknown> {
  readonly id: `${string}:${string}`;
  readonly stage: WorkflowStage;
  readonly label: string;
  readonly pluginScope: PluginScope;
  readonly inputType: string;
  readonly outputType: string;
  readonly defaultPriority: SignalPriority;
  readonly allowedLayers: readonly SignalLayer[];
  readonly payload: TPayload;
}

export interface WorkflowEdge<
  TFrom extends string = string,
  TTo extends string = string,
> {
  readonly from: TFrom;
  readonly to: TTo;
  readonly reason: string;
}

export type WorkflowPath<TNodes extends readonly WorkflowNode[]> = TNodes extends readonly [
  infer Head extends WorkflowNode,
  ...infer Tail extends readonly WorkflowNode[],
]
  ? `${Head['id']}${Tail extends [] ? '' : `/${WorkflowPath<Tail>}`}`
  : never;

export interface WorkflowTemplate<
  TNodes extends readonly WorkflowNode[] = readonly WorkflowNode[],
  TEdges extends readonly WorkflowEdge[] = readonly WorkflowEdge[],
> {
  readonly id: `${string}::workflow`;
  readonly name: string;
  readonly revision: number;
  readonly nodes: TNodes;
  readonly edges: TEdges;
  readonly createdAt: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface WorkflowRunInput {
  readonly signalSetId: string;
  readonly signals: readonly AnySignalEnvelope[];
  readonly stages: readonly WorkflowStage[];
}

export interface WorkflowRunOutput {
  readonly path: string;
  readonly nodeCount: number;
  readonly layerCoverage: Readonly<Record<SignalLayer, number>>;
  readonly stageSequence: readonly WorkflowStage[];
}

const defaultEdge = (from: string, to: string, reason: string): WorkflowEdge => ({ from, to, reason });

export const normalizeLayer = (layer: string): SignalLayer =>
  (signalLayerCatalog.includes(layer as SignalLayer) ? (layer as SignalLayer) : 'readiness');

export const buildStagePath = <TNodes extends readonly WorkflowNode[]>(nodes: TNodes): StageRoute =>
  nodes.map((node) => node.stage).toSorted().join('/');

export const buildWorkflowPath = (nodes: readonly WorkflowNode[]): string =>
  nodes.map((node) => node.id).join(' -> ');

export const dedupeWorkflowIds = <TNodes extends readonly WorkflowNode[]>(nodes: TNodes): readonly WorkflowNode[] =>
  nodes.toSorted((left, right) => left.id.localeCompare(right.id)).reduce<WorkflowNode[]>((acc, node) => {
    const exists = acc.some((entry) => entry.id === node.id);
    if (!exists) {
      acc.push(node);
    }
    return acc;
  }, []);

export const normalizeStageCoverage = <TNodes extends readonly WorkflowNode[]>(nodes: TNodes): Record<WorkflowStage, number> =>
  workflowStages.reduce(
    (acc, stage) => {
      acc[stage] = nodes.filter((node) => node.stage === stage).length;
      return acc;
    },
    {
      ingest: 0,
      evaluate: 0,
      simulate: 0,
      synthesize: 0,
      execute: 0,
    },
  );

export class WorkflowGraph<const TTemplate extends WorkflowTemplate = WorkflowTemplate> {
  #nodes: TTemplate['nodes'];
  #edges: TTemplate['edges'];
  #path = Symbol('path');

  public constructor(private readonly template: TTemplate) {
    this.#nodes = template.nodes;
    this.#edges = template.edges;
  }

  public get nodes(): readonly WorkflowNode[] {
    return this.#nodes;
  }

  public get id(): TTemplate['id'] {
    return this.template.id;
  }

  public get nodeIds(): readonly string[] {
    return this.#nodes.map((node) => node.id);
  }

  public get edgeCount(): number {
    return this.#edges.length;
  }

  public listEdges(from?: string): readonly WorkflowEdge[] {
    return from
      ? this.#edges.filter((edge) => edge.from === from)
      : [...this.#edges];
  }

  public listByLayer(layer: SignalLayer): readonly TTemplate['nodes'][number][] {
    return this.#nodes.filter((node) => node.allowedLayers.includes(layer));
  }

  public findNode(nodeId: string): TTemplate['nodes'][number] | undefined {
    return this.#nodes.find((node) => node.id === nodeId);
  }

  public isAcyclic(): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const walk = (current: string): boolean => {
      if (stack.has(current)) return false;
      if (visited.has(current)) return true;
      visited.add(current);
      stack.add(current);

      const next = this.listEdges(current).map((edge) => edge.to);
      for (const nextNode of next) {
        if (!walk(nextNode)) {
          return false;
        }
      }

      stack.delete(current);
      return true;
    };

    return this.#nodes.every((node) => walk(node.id));
  }

  public topologicalOrder(): readonly string[] {
    const edgesByFrom = new Map<string, string[]>(
      this.#nodes.map((node) => [node.id, this.listEdges(node.id).map((edge) => edge.to)]),
    );
    const indegree = new Map<string, number>();
    for (const nodeId of this.#nodes.map((node) => node.id)) {
      indegree.set(nodeId, 0);
    }
    for (const edge of this.#edges) {
      indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }

      const zero = [...this.#nodes
      .map((node) => node.id)
      .filter((nodeId) => indegree.get(nodeId) === 0)] as string[];
    const ordered: string[] = [];
    while (zero.length > 0) {
      const current = zero.pop();
      if (!current) break;
      ordered.push(current);
      for (const next of edgesByFrom.get(current) ?? []) {
        const nextDegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextDegree);
        if (nextDegree === 0) {
          zero.push(next);
        }
      }
    }

    return ordered.length === this.#nodes.length ? ordered : this.nodeIds;
  }

  public *iterPaths(): IterableIterator<string> {
    const nodes = this.#nodes.toSorted((left, right) => left.id.localeCompare(right.id));
    for (const node of nodes) {
      const route = [node.id];
      const next = this.listEdges(node.id);
      if (next.length === 0) {
        yield route.join('::');
        continue;
      }
      for (const edge of next) {
        yield `${node.id} => ${edge.to} [${edge.reason}]`;
      }
    }
  }

  public summarizeRun<TInput extends WorkflowRunInput>(input: NoInfer<TInput>): WorkflowRunOutput {
    const stageCoverage = normalizeStageCoverage(input.signals.length ? this.#nodes : []);
    return {
      path: buildWorkflowPath(this.#nodes),
      nodeCount: this.#nodes.length,
      layerCoverage: signalLayers.reduce(
        (acc, layer) => {
          const matches = this.#nodes.filter((node) => node.allowedLayers.includes(layer));
          acc[layer] = matches.length;
          return acc;
        },
        {} as Record<SignalLayer, number>,
      ),
      stageSequence: this.topologicalOrder().map((id) => this.findNode(id)?.stage ?? 'ingest'),
    };
  }

  public link(input: WorkflowEdge): void {
    this.#edges = [...this.#edges, input] as TTemplate['edges'];
  }

  public unlink(from: string, to: string): boolean {
    const next = [...this.#edges];
    const index = next.findIndex((edge) => edge.from === from && edge.to === to);
    if (index < 0) {
      return false;
    }
    next.splice(index, 1);
    this.#edges = next as TTemplate['edges'];
    return true;
  }

  public static inferPath(
    template: WorkflowTemplate,
  ): StageRoute {
    return template.nodes
      .map((node) => node.stage)
      .filter((stage): stage is WorkflowStage => workflowStages.includes(stage as WorkflowStage))
      .toSorted((left, right) => left.localeCompare(right))
      .join('/') as StageRoute;
  }

  public static chain(
    ...nodes: readonly WorkflowNode[]
  ): WorkflowTemplate {
    const sortedNodes = nodes.toSorted((left, right) => left.id.localeCompare(right.id));
    const edges = sortedNodes
      .map((node, index) =>
        index + 1 < sortedNodes.length
          ? defaultEdge(node.id, sortedNodes[index + 1].id, `${node.id}->${sortedNodes[index + 1].id}`)
          : null,
      )
      .filter((edge): edge is WorkflowEdge => edge !== null);
    return {
      id: `${nodes[0]?.id ?? 'cockpit'}::workflow` as `${string}::workflow`,
      name: 'runtime-chain',
      revision: 1,
      nodes: sortedNodes,
      edges,
      createdAt: new Date().toISOString(),
      labels: {
        mode: 'chain',
        nodes: String(sortedNodes.length),
      },
    };
  }
}

export const inferSignalsByLayer = <TSignals extends readonly AnySignalEnvelope[]>(
  signals: TSignals,
  layer: SignalLayer,
): readonly TSignals[number][] =>
  signals.filter((signal) => signal.layer === layer) as readonly TSignals[number][];
