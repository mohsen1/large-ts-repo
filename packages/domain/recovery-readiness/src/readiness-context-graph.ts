import type { ReadinessDirective, ReadinessRunId, ReadinessSignal, ReadinessTarget, RecoveryReadinessPlan } from './types';
import { weightedRiskDensity } from './signal-matrix';

export interface ContextNode {
  readonly key: string;
  readonly label: string;
  readonly role: 'run' | 'plan' | 'target' | 'signal' | 'directive';
}

export interface ContextEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: 'contains' | 'targets' | 'drives' | 'depends-on';
  readonly weight: number;
}

export interface ReadinessContextGraph {
  readonly runId: ReadinessRunId;
  readonly nodes: readonly ContextNode[];
  readonly edges: readonly ContextEdge[];
  readonly summary: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly densityScore: number;
  };
}

export interface ContextBuilderInput {
  readonly runId: ReadinessRunId;
  readonly plan: RecoveryReadinessPlan;
  readonly signals: readonly ReadinessSignal[];
  readonly directives: readonly ReadinessDirective[];
}

interface TargetDensity {
  count: number;
  ids: Set<string>;
}

export function buildContextGraph(input: ContextBuilderInput): ReadinessContextGraph {
  const nodes: ContextNode[] = [
    {
      key: `${input.runId}:plan`,
      label: input.plan.title,
      role: 'plan',
    },
    {
      key: `${input.runId}:run`,
      label: `run:${input.runId}`,
      role: 'run',
    },
  ];

  const edges: ContextEdge[] = [
    {
      from: `${input.runId}:run`,
      to: `${input.runId}:plan`,
      relation: 'contains',
      weight: 1,
    },
  ];

  const targetIndex = new Map<ReadinessTarget['id'], TargetDensity>();
  for (const target of input.plan.targets) {
    const targetNode: ContextNode = {
      key: `${input.runId}:target:${target.id}`,
      label: `${target.ownerTeam}/${target.name}`,
      role: 'target',
    };
    nodes.push(targetNode);
    edges.push({
      from: `${input.runId}:plan`,
      to: targetNode.key,
      relation: 'targets',
      weight: 2,
    });

    targetIndex.set(target.id, {
      count: 0,
      ids: new Set([target.id]),
    });
  }

  for (const signal of input.signals) {
    const signalNode: ContextNode = {
      key: `${input.runId}:signal:${signal.signalId}`,
      label: `${signal.source}:${signal.name}`,
      role: 'signal',
    };
    nodes.push(signalNode);
    edges.push({
      from: `${input.runId}:run`,
      to: signalNode.key,
      relation: 'contains',
      weight: 1 + signal.severity.length * 0.1,
    });

    const targetDensity = targetIndex.get(signal.targetId);
    if (targetDensity) {
      targetDensity.count += 1;
      const targetNodes = `${input.runId}:target:${signal.targetId}`;
      edges.push({
        from: signalNode.key,
        to: targetNodes,
        relation: 'targets',
        weight: 1 + targetDensity.count * 0.25,
      });
    }
  }

  const directiveIndex = new Map<ReadinessDirective['directiveId'], ReadinessDirective>();
  for (const directive of input.directives) {
    const directiveNode: ContextNode = {
      key: `${input.runId}:directive:${directive.directiveId}`,
      label: directive.name,
      role: 'directive',
    };
    nodes.push(directiveNode);

    edges.push({
      from: `${input.runId}:plan`,
      to: directiveNode.key,
      relation: 'drives',
      weight: directive.enabled ? 3 : 1,
    });
    directiveIndex.set(directive.directiveId, directive);
  }

  for (const directive of directiveIndex.values()) {
    for (const parent of directive.dependsOn) {
      edges.push({
        from: `${input.runId}:directive:${parent.directiveId}`,
        to: `${input.runId}:directive:${directive.directiveId}`,
        relation: 'depends-on',
        weight: 1.5,
      });
    }
  }

  const targetWeights = signalDensityByTarget(input.plan.targets, input.signals);
  const totalWeight = [...targetWeights.values()].reduce((sum, density) => sum + density.count, 0);
  const edgeDensity = weightedRiskDensity(input.signals);
  const densityScore = Number(((edges.length + totalWeight + edgeDensity) / Math.max(1, nodes.length)).toFixed(3));

  return {
    runId: input.runId,
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      densityScore,
    },
  };
}

export function summarizeContext(graph: ReadinessContextGraph): {
  readonly hotspotNodes: readonly string[];
  readonly dominantRelations: readonly [string, number][];
  readonly criticality: number;
} {
  const relationTotals = new Map<string, number>();
  for (const edge of graph.edges) {
    relationTotals.set(edge.relation, (relationTotals.get(edge.relation) ?? 0) + edge.weight);
  }

  const nodeDegrees = new Map<string, number>();
  for (const edge of graph.edges) {
    nodeDegrees.set(edge.from, (nodeDegrees.get(edge.from) ?? 0) + 1);
    nodeDegrees.set(edge.to, (nodeDegrees.get(edge.to) ?? 0) + 1);
  }
  const hotspotNodes = [...nodeDegrees.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([node]) => node);

  const dominantRelations = [...relationTotals.entries()].sort((left, right) => right[1] - left[1]);
  const weightedCriticality = graph.nodes.reduce((sum, node) => sum + node.key.length, 0) / Math.max(1, graph.edges.length);
  const criticality = Number(weightedCriticality.toFixed(3));

  return {
    hotspotNodes,
    dominantRelations,
    criticality,
  };
}

export function topologicalSignalPaths(graph: ReadinessContextGraph): readonly string[] {
  const outDegrees = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outDegrees.set(node.key, 0);
    adjacency.set(node.key, []);
  }
  for (const edge of graph.edges) {
    const current = adjacency.get(edge.from) ?? [];
    current.push(edge.to);
    adjacency.set(edge.from, current);
    outDegrees.set(edge.from, (outDegrees.get(edge.from) ?? 0) + 1);
  }
  const queue = [...outDegrees.entries()].filter(([, value]) => value === 0).map(([node]) => node);
  const ordered: string[] = [];
  const remaining = new Map(outDegrees);

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      break;
    }
    ordered.push(node);
    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const nextCount = (remaining.get(neighbor) ?? 0) - 1;
      remaining.set(neighbor, nextCount);
      if (nextCount <= 0) {
        queue.push(neighbor);
      }
    }
  }
  const cycle = graph.nodes.map((node) => node.key).filter((node) => !ordered.includes(node));
  return [...ordered, ...cycle];
}

function signalDensityByTarget(
  targets: readonly ReadinessTarget[],
  signals: readonly ReadinessSignal[],
): ReadonlyMap<ReadinessTarget['id'], TargetDensity> {
  const matrix = new Map<ReadinessTarget['id'], TargetDensity>(
    targets.map((target) => [target.id, { count: 0, ids: new Set([target.id]) }]),
  );

  for (const signal of signals) {
    const current = matrix.get(signal.targetId);
    if (current) {
      current.count += 1;
      current.ids.add(signal.signalId);
    }
  }

  return matrix;
}
