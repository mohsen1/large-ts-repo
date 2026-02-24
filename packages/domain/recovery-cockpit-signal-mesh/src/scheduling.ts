import type { MeshExecutionPhase, MeshIntent, MeshNode, MeshPlan, MeshTopology, MeshNodeId } from './types';

type QueueItem<T> = {
  readonly node: MeshNodeId;
  readonly value: T;
};

export const phaseOrder = (): readonly MeshExecutionPhase[] => [
  'detect',
  'assess',
  'orchestrate',
  'simulate',
  'execute',
  'observe',
  'recover',
  'settle',
];

export const nextPhaseAfter = (phase: MeshExecutionPhase): MeshExecutionPhase | undefined => {
  const transitions: Readonly<Record<MeshExecutionPhase, MeshExecutionPhase | undefined>> = {
    detect: 'assess',
    assess: 'orchestrate',
    orchestrate: 'simulate',
    simulate: 'execute',
    execute: 'observe',
    observe: 'recover',
    recover: 'settle',
    settle: undefined,
  };
  return transitions[phase];
};

export const isTerminalPhase = (phase: MeshExecutionPhase): boolean => phase === 'settle' || phase === 'recover';

export const isForwardPath = (steps: readonly MeshExecutionPhase[]): boolean =>
  steps.every((current, index, all) => index === all.length - 1 || phaseOrder().indexOf(current) <= phaseOrder().indexOf(all[index + 1]));

export type MeshTopologySeed = readonly {
  readonly phase: MeshExecutionPhase;
  readonly node: MeshNode;
}[];

export const topologicalLayers = <T extends MeshTopology>(topology: T): ReadonlyArray<readonly MeshNodeId[]> => {
  const nodesById = new Set(topology.nodes.map((node) => node.id));
  const outgoing = new Map<MeshNodeId, MeshNodeId[]>();
  const incoming = new Map<MeshNodeId, number>();
  for (const node of topology.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, 0);
  }
  for (const edge of topology.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      continue;
    }
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const queue: MeshNodeId[] = [];
  for (const [node, count] of incoming) {
    if (count === 0) {
      queue.push(node);
    }
  }

  const layers: MeshNodeId[][] = [];
  const visited = new Set<MeshNodeId>();

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    queue.length = 0;
    for (const node of layer) {
      visited.add(node);
      for (const next of outgoing.get(node) ?? []) {
        const count = (incoming.get(next) ?? 0) - 1;
        if (count === 0) {
          incoming.set(next, 0);
          queue.push(next);
        } else {
          incoming.set(next, count);
        }
      }
    }
  }

  return layers.length > 0 ? Object.freeze(layers) : [Object.freeze(Array.from(nodesById.values()))];
};

export const topoSortMissing = <T extends MeshTopology>(topology: T): readonly MeshNodeId[] =>
  topology.nodes.map((node) => node.id).filter((id) => !topologicalLayers(topology).flat().includes(id));

export const toPlanSeed = (topology: MeshTopology): MeshTopologySeed =>
  topology.nodes
    .map((node) => ({ phase: node.stage, node }))
    .sort((left, right) => {
      if (left.phase === right.phase) {
        return left.node.id > right.node.id ? 1 : -1;
      }
      return phaseOrder().indexOf(left.phase) - phaseOrder().indexOf(right.phase);
    });

export const splitIntents = (intents: readonly MeshIntent[]): readonly [MeshIntent[], MeshIntent[]] => [
  intents.filter((intent) => intent.expectedConfidence >= 0.5),
  intents.filter((intent) => intent.expectedConfidence < 0.5),
];

export const rankIntents = (intents: readonly MeshIntent[]): readonly MeshIntent[] =>
  [...intents].sort((left, right) => right.expectedConfidence - left.expectedConfidence);

export const mapByPhase = (plan: MeshPlan): Record<MeshExecutionPhase, MeshIntent[]> => {
  const grouped: Record<MeshExecutionPhase, MeshIntent[]> = {
    detect: [],
    assess: [],
    orchestrate: [],
    simulate: [],
    execute: [],
    observe: [],
    recover: [],
    settle: [],
  };
  for (const intent of plan.intents) {
    grouped[intent.phase].push(intent);
  }
  return grouped;
};

export const phaseWindow = (plan: MeshPlan, phase: MeshExecutionPhase): readonly MeshIntent[] =>
  plan.intents.filter((intent) => intent.phase === phase);

export type MeshPhaseBucket = { readonly phase: MeshExecutionPhase; readonly intents: readonly MeshIntent[] };

export const phaseBuckets = (plan: MeshPlan): readonly MeshPhaseBucket[] => {
  const grouped = mapByPhase(plan);
  return phaseOrder().map((phase) => ({ phase, intents: Object.freeze(grouped[phase]) }));
};

export const flattenBuckets = (plan: MeshPlan): readonly MeshIntent[] => phaseOrder().flatMap((phase) => phaseWindow(plan, phase));

export const estimateCoverage = (plan: MeshPlan): number =>
  plan.intents.reduce((sum, intent) => sum + intent.targetNodeIds.length, 0);

export const resolveLayer = (layer: readonly MeshNodeId[]): readonly MeshNodeId[] =>
  layer
    .map((nodeId) => nodeId)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

type PlannerState = {
  readonly phase: MeshExecutionPhase;
  readonly planned: number;
  readonly queue: readonly QueueItem<MeshIntent>[];
};

export const createPlannerState = (phase: MeshExecutionPhase): PlannerState => ({
  phase,
  planned: 0,
  queue: [],
});

export const scheduleIntents = (plan: MeshPlan, phase: MeshExecutionPhase): readonly MeshPlan[] => {
  const buckets = phaseBuckets(plan);
  const active = buckets.find((bucket) => bucket.phase === phase);
  if (!active) {
    return [];
  }
  const intents = active.intents;
  const chunkSize = 3;
  const runs: MeshPlan[] = [];
  for (let index = 0; index < intents.length; index += chunkSize) {
    const chunk = intents.slice(index, index + chunkSize);
    runs.push({
      ...plan,
      steps: chunk.flatMap((intent) => [
        {
          stage: phase,
          node: intent.targetNodeIds[0] ?? ('' as MeshNodeId),
          startedAt: new Date().toISOString(),
          input: intent,
          output: {
            intentId: intent.id as unknown as { readonly intentId: string },
          },
        },
      ]),
    });
  }
  return runs;
};
