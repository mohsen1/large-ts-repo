import {
  PolicyExecutionWindow,
  PolicyGraph,
  PolicyNode,
  PolicyPlan,
  PolicyPlanStep,
  OrchestrationNodeId,
} from './models';

export interface PlannerInput {
  orchestratorId: string;
  graph: PolicyGraph;
  requestedConcurrency: number;
  maxLatencyMs?: number;
}

export interface PlannerWarning {
  nodeId: OrchestrationNodeId;
  message: string;
  severity: 'warning' | 'error';
}

const defaultWindow: PolicyExecutionWindow = {
  id: 'window:default' as PolicyExecutionWindow['id'],
  start: '1970-01-01T00:00:00.000Z',
  end: '2099-12-31T00:00:00.000Z',
  timezone: 'UTC',
};

const hasCircularDependency = (graph: PolicyGraph): boolean => {
  const byId = new Map<OrchestrationNodeId, PolicyNode>();
  for (const node of graph.nodes) byId.set(node.id, node);

  const visited = new Set<OrchestrationNodeId>();
  const stack = new Set<OrchestrationNodeId>();

  const dfs = (nodeId: OrchestrationNodeId): boolean => {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    stack.add(nodeId);

    const node = byId.get(nodeId);
    if (node) {
      for (const dep of node.dependsOn) {
        if (dfs(dep)) return true;
      }
    }

    stack.delete(nodeId);
    return false;
  };

  return graph.nodes.some((node) => dfs(node.id));
};

const outgoing = (node: PolicyNode, graph: PolicyGraph): number => {
  let outbound = 0;
  for (const dep of graph.edges) {
    if (dep.from === node.id) outbound += 1;
  }
  return outbound;
};

const inDegree = (node: PolicyNode, graph: PolicyGraph): number => {
  let count = 0;
  for (const dep of graph.edges) {
    if (dep.to === node.id) count += 1;
  }
  return count;
};

export const validateWindow = (window: PolicyExecutionWindow): PlannerWarning[] => {
  const start = new Date(window.start);
  const end = new Date(window.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [{ nodeId: '' as OrchestrationNodeId, message: `Invalid date window ${window.id}`, severity: 'error' }];
  }
  if (start >= end) {
    return [{ nodeId: '' as OrchestrationNodeId, message: `Window ${window.id} has inverted boundaries`, severity: 'error' }];
  }
  return [];
};

export const planPolicyGraph = (input: PlannerInput): { plan: PolicyPlan; warnings: PlannerWarning[] } => {
  const warnings: PlannerWarning[] = [];
  if (input.graph.nodes.length === 0) {
    return {
      plan: {
        id: `${input.orchestratorId}:empty-plan` as PolicyPlan['id'],
        orchestrator: input.orchestratorId as PolicyPlan['orchestrator'],
        steps: [],
        createdAt: new Date().toISOString(),
        state: 'draft',
        revision: 0,
      },
      warnings,
    };
  }

  if (hasCircularDependency(input.graph)) {
    warnings.push({ nodeId: '' as OrchestrationNodeId, message: 'Circular dependency detected', severity: 'error' });
  }

  for (const node of input.graph.nodes) {
    for (const window of node.artifact.windows.length > 0 ? node.artifact.windows : [defaultWindow]) {
      warnings.push(...validateWindow(window).map((item) => ({ ...item, nodeId: node.id })));
    }
    if (node.timeoutSeconds <= 0) {
      warnings.push({ nodeId: node.id, message: 'Timeout must be positive', severity: 'warning' });
    }
    if (node.slaWindowMinutes <= 0) {
      warnings.push({ nodeId: node.id, message: 'SLA window must be positive', severity: 'warning' });
    }
  }

  const remaining = new Set(input.graph.nodes.map((node) => node.id));
  const remainingDependencies = new Map<OrchestrationNodeId, OrchestrationNodeId[]>(
    input.graph.nodes.map((node) => [node.id, [...node.dependsOn]]),
  );
  const steps: PolicyPlanStep[] = [];
  let wave = 0;

  while (remaining.size > 0) {
    const candidates = input.graph.nodes.filter((node) => {
      const dependsOn = remainingDependencies.get(node.id) ?? [];
      return remaining.has(node.id) && dependsOn.length === 0;
    });

    const resolved: PolicyNode[] = [];
    for (const node of candidates) {
      const ready = node.dependsOn.every((dep) => !remaining.has(dep));
      if (ready) {
        resolved.push(node);
        remaining.delete(node.id);
      }
    }

    if (resolved.length === 0) {
      const [fallback] = input.graph.nodes.filter((node) => remaining.has(node.id));
      if (fallback) {
        resolved.push(fallback);
        remaining.delete(fallback.id);
        warnings.push({ nodeId: fallback.id, message: 'Breaking dependency deadlock by emergency scheduling', severity: 'warning' });
      } else {
        break;
      }
    }

    const sortedByCriticality = resolved
      .sort((a, b) => {
        const aPri = inDegree(a, input.graph);
        const bPri = inDegree(b, input.graph);
        if (aPri !== bPri) return aPri - bPri;
        return outgoing(b, input.graph) - outgoing(a, input.graph);
      })
      .slice(0, Math.max(1, input.requestedConcurrency));

    const maxLatency = sortedByCriticality.reduce((sum, node) => sum + node.timeoutSeconds * 1000, 0);
    steps.push({
      batchId: `${input.orchestratorId}:wave-${wave}` as PolicyPlanStep['batchId'],
      nodeIds: sortedByCriticality.map((node) => node.id),
      order: wave,
      maxConcurrency: Math.max(1, input.requestedConcurrency),
      estimatedLatencyMs: maxLatency,
    });
    wave += 1;

    for (const node of sortedByCriticality) {
      for (const edge of input.graph.edges) {
        if (edge.from === node.id) {
          const dependency = remainingDependencies.get(edge.to);
          if (!dependency) continue;
          const filtered = dependency.filter((entry) => entry !== node.id);
          if (filtered.length !== dependency.length) {
            remainingDependencies.set(edge.to, filtered);
          }
        }
      }
    }
    if (input.maxLatencyMs && maxLatency > input.maxLatencyMs) {
      warnings.push({ nodeId: '' as OrchestrationNodeId, message: `Wave ${wave} exceeds max latency`, severity: 'warning' });
    }
  }

  const now = new Date().toISOString();
  return {
    plan: {
      id: `${input.orchestratorId}:plan` as PolicyPlan['id'],
      orchestrator: input.orchestratorId as PolicyPlan['orchestrator'],
      steps,
      createdAt: now,
      revision: 1,
      state: warnings.some((item) => item.severity === 'error') ? 'degraded' : 'draft',
    },
    warnings,
  };
};
