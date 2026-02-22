import { buildWorkflowRunId, type WorkflowEdgeList, type WorkflowGraphPath, type WorkflowNode, type WorkflowTemplate } from './types';

export interface WorkflowTopology {
  readonly templateId: WorkflowTemplate['id'];
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  readonly indegree: ReadonlyMap<string, number>;
  readonly inOrder: readonly string[];
}

export interface TopologyIssue {
  readonly type: 'cycle' | 'missing-prerequisite' | 'unreachable';
  readonly nodeId: string;
  readonly detail: string;
}

export interface WorkflowGraphReport {
  readonly templateId: WorkflowTemplate['id'];
  readonly edges: WorkflowEdgeList;
  readonly topo: WorkflowTopology | null;
  readonly issues: readonly TopologyIssue[];
  readonly depth: number;
}

const buildEdges = (nodes: readonly WorkflowNode[]): WorkflowEdgeList =>
  nodes.flatMap((node) =>
    node.dependencies.map((dependency) => [dependency.prerequisiteId, node.id] as [string, string]));

const buildAdjacency = (nodes: readonly WorkflowNode[]): ReadonlyMap<string, readonly string[]> => {
  const map = new Map<string, string[]>();
  for (const node of nodes) {
    map.set(node.id, []);
  }
  for (const [from, to] of buildEdges(nodes)) {
    const bucket = map.get(from);
    if (bucket) {
      bucket.push(to);
    } else {
      map.set(from, [to]);
    }
  }
  return map;
};

const buildInDegree = (nodes: readonly WorkflowNode[]): ReadonlyMap<string, number> => {
  const degree = new Map<string, number>();
  for (const node of nodes) {
    degree.set(node.id, 0);
  }
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      const next = degree.get(node.id);
      degree.set(node.id, (next ?? 0) + 1);
      if (!degree.has(dependency.prerequisiteId)) {
        degree.set(dependency.prerequisiteId, 0);
      }
    }
  }
  return degree;
};

export const buildTopology = (template: WorkflowTemplate): WorkflowGraphReport => {
  const nodes = template.route.nodes;
  const edges = buildEdges(nodes);
  const adjacency = buildAdjacency(nodes);
  const indegree = buildInDegree(nodes);
  const queue = [...nodes]
    .map((node) => node.id)
    .filter((id) => (indegree.get(id) ?? 0) === 0);
  const inOrder: string[] = [];
  const queueCount = new Map<string, number>(nodes.map((node) => [node.id, 0]));

  const mutableDegree = new Map(indegree);
  const visit = [...queue];
  while (visit.length > 0) {
    const id = visit.shift();
    if (!id) {
      continue;
    }
    inOrder.push(id);
    const children = adjacency.get(id) ?? [];
    for (const child of children) {
      const prior = mutableDegree.get(child) ?? 0;
      const next = Math.max(0, prior - 1);
      mutableDegree.set(child, next);
      if (next === 0) {
        visit.push(child);
      }
    }
  }

  const issues: TopologyIssue[] = [];
  for (const node of nodes) {
    if (!template.scope) {
      issues.push({
        type: 'missing-prerequisite',
        nodeId: node.id,
        detail: 'invalid scope',
      });
    }
  }

  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!nodes.some((next) => next.id === dependency.prerequisiteId)) {
        issues.push({
          type: 'missing-prerequisite',
          nodeId: node.id,
          detail: `missing ${dependency.prerequisiteId}`,
        });
      }
    }
  }

  if (inOrder.length !== nodes.length) {
    const unresolved = nodes
      .map((node) => node.id)
      .filter((id) => !inOrder.includes(id));
    for (const nodeId of unresolved) {
      issues.push({
        type: 'cycle',
        nodeId,
        detail: 'cycle detected or disconnected dependency',
      });
    }
  }

  const topo = inOrder.length === nodes.length ? {
    templateId: template.id,
    adjacency,
    indegree,
    inOrder,
  } : null;

  return {
    templateId: template.id,
    edges,
    topo,
    issues,
    depth: inOrder.length,
  };
};

export const pathFromNode = (nodeIds: readonly string[], index: number): WorkflowGraphPath =>
  nodeIds.slice(0, index + 1);

export const buildExecutionBatch = (
  template: WorkflowTemplate,
  maxParallel = 2,
): readonly string[][] => {
  const topology = buildTopology(template);
  if (!topology.topo) {
    return [];
  }
  const byBatch: string[][] = [];
  let cursor = 0;
  while (cursor < topology.topo.inOrder.length) {
    byBatch.push(topology.topo.inOrder.slice(cursor, cursor + maxParallel));
    cursor += maxParallel;
  }
  return byBatch;
};

export const estimateTotalWindowMinutes = (template: WorkflowTemplate): number =>
  template.route.nodes.reduce((total, node) => total + node.expectedDurationMinutes, 0);

export const computeCriticalPathLength = (template: WorkflowTemplate): number => {
  const topology = buildTopology(template);
  if (!topology.topo) {
    return 0;
  }
  let critical = 0;
  for (const node of template.route.nodes) {
    const weight = node.expectedDurationMinutes;
    critical = Math.max(critical, weight);
  }
  return critical;
};

export const normalizeExecutionPlan = (
  template: WorkflowTemplate,
  startedAt: string,
): readonly {
  readonly runId: string;
  readonly nodeId: string;
  readonly batchIndex: number;
  readonly expectedFinishAt: string;
}[] => {
  const batchSize = Math.max(1, template.scope?.region?.length ? 1 : 1);
  const batches = buildExecutionBatch(template, batchSize);
  let cursor = Date.parse(startedAt);
  return batches.flatMap((batch, batchIndex) =>
    batch.map((nodeId, nodeIndex) => {
      const node = template.route.nodes.find((candidate) => candidate.id === nodeId);
      const duration = node?.expectedDurationMinutes ?? 1;
      const expectedFinishAt = new Date(cursor + duration * 60_000).toISOString();
      cursor = Date.parse(expectedFinishAt) + (nodeIndex === batch.length - 1 ? 0 : 0);
      return {
        runId: buildWorkflowRunId(template.id, nodeId, batchIndex),
        nodeId,
        batchIndex,
        expectedFinishAt,
      };
    }),
  );
};
