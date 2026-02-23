import {
  EntityId,
  RecoveryAction,
  RecoveryPlan,
  Region,
  ServiceCode,
  UtcIsoTimestamp,
  toTimestamp,
} from '@domain/recovery-cockpit-models';

export type ServiceCriticality = 'low' | 'medium' | 'high' | 'critical';

export type ServiceTag = 'stateful' | 'stateless' | 'database' | 'edge' | 'control-plane';

export type ServiceTopologyNode = {
  readonly nodeId: EntityId;
  readonly serviceCode: ServiceCode;
  readonly region: Region;
  readonly criticality: ServiceCriticality;
  readonly tags: readonly ServiceTag[];
  readonly dependencies: readonly EntityId[];
  readonly actionCount: number;
  readonly averageDurationMinutes: number;
  readonly topologies: readonly string[];
};

export type WorkloadTopology = {
  readonly namespace: string;
  readonly region: Region;
  readonly nodes: readonly ServiceTopologyNode[];
  readonly generatedAt: UtcIsoTimestamp;
};

export type ServiceDependencyEdge = {
  readonly from: EntityId;
  readonly to: EntityId;
  readonly weight: number;
  readonly reason: 'order' | 'ownership' | 'blast-radius';
};

export type TopologySnapshot = {
  readonly edges: readonly ServiceDependencyEdge[];
  readonly nodesById: ReadonlyMap<EntityId, ServiceTopologyNode>;
  readonly orderedByCriticality: readonly EntityId[];
  readonly heatScore: number;
  readonly nodeCount: number;
};

const CRITICALITY_ORDER: Record<ServiceCriticality, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const inferTags = (action: RecoveryAction): readonly ServiceTag[] => {
  const tags = new Set<ServiceTag>(['edge']);
  if (action.command.includes('db') || action.command.includes('sql')) {
    tags.add('database');
  }
  if (action.command.includes('drain') || action.command.includes('traffic')) {
    tags.add('control-plane');
  }
  if (action.command.includes('state') || action.command.includes('warm')) {
    tags.add('stateful');
  }
  if (action.command.includes('stateless') || action.command.includes('lambda')) {
    tags.add('stateless');
  }
  return Array.from(tags);
};

const inferCriticality = (action: RecoveryAction, dependencyFanout: number): ServiceCriticality => {
  if (action.dependencies.length >= 4 || dependencyFanout >= 6 || action.expectedDurationMinutes > 45) {
    return 'critical';
  }
  if (action.dependencies.length >= 2 || dependencyFanout >= 3 || action.expectedDurationMinutes > 20) {
    return 'high';
  }
  if (action.dependencies.length >= 1 || dependencyFanout >= 1 || action.expectedDurationMinutes > 10) {
    return 'medium';
  }
  return 'low';
};

const toNode = (plan: RecoveryPlan, action: RecoveryAction): ServiceTopologyNode => {
  const fanout = plan.actions.filter((candidate) => candidate.dependencies.includes(action.id)).length;
  const criticality = inferCriticality(action, fanout);
  return {
    nodeId: action.id,
    serviceCode: action.serviceCode,
    region: action.region,
    criticality,
    tags: inferTags(action),
    dependencies: action.dependencies,
    actionCount: 1,
    averageDurationMinutes: action.expectedDurationMinutes,
    topologies: [`${action.command}:${criticality}`],
  };
};

const toEdges = (plan: RecoveryPlan): readonly ServiceDependencyEdge[] => {
  const edges: ServiceDependencyEdge[] = [];
  for (const action of plan.actions) {
    for (const dependency of action.dependencies) {
      edges.push({
        from: action.id,
        to: dependency,
        weight: action.expectedDurationMinutes,
        reason: action.expectedDurationMinutes > 20 ? 'blast-radius' : 'order',
      });
    }
    if (action.command.includes('drain')) {
      edges.push({
        from: action.id,
        to: `${action.id}-post` as EntityId,
        weight: 1,
        reason: 'ownership',
      });
    }
  }
  return edges;
};

export const buildTopologySnapshot = (plan: RecoveryPlan): TopologySnapshot => {
  const nodes = plan.actions.map((action) => toNode(plan, action));
  const orderedNodes = [...nodes].sort((left, right) => {
    const leftScore = CRITICALITY_ORDER[left.criticality] + left.dependencies.length * 0.2;
    const rightScore = CRITICALITY_ORDER[right.criticality] + right.dependencies.length * 0.2;
    return rightScore - leftScore;
  });

  const map = new Map<EntityId, ServiceTopologyNode>();
  for (const node of nodes) {
    map.set(node.nodeId, node);
  }

  const criticalityScore = orderedNodes.reduce((acc, node) => {
    return acc + CRITICALITY_ORDER[node.criticality] * (1 + Math.min(1, node.topologies.length / 4));
  }, 0);

  const orderedByCriticality = [...orderedNodes]
    .map((node): EntityId => node.nodeId)
    .sort((leftNodeId, rightNodeId) => {
      const leftRank = CRITICALITY_ORDER[map.get(leftNodeId)?.criticality ?? 'low'];
      const rightRank = CRITICALITY_ORDER[map.get(rightNodeId)?.criticality ?? 'low'];
      return rightRank - leftRank;
    });

  return {
    edges: toEdges(plan),
    nodesById: map,
    orderedByCriticality,
    heatScore: Math.min(100, criticalityScore / Math.max(1, nodes.length) * 35),
    nodeCount: nodes.length,
  };
};

export const buildWorkloadTopology = (plan: RecoveryPlan, namespace: string): WorkloadTopology => {
  const nodes = plan.actions.map((action) => toNode(plan, action));
  return {
    namespace,
    region: plan.actions[0]?.region ?? ('global' as Region),
    nodes,
    generatedAt: toTimestamp(new Date()),
  };
};

export const summarizeTopology = (plan: RecoveryPlan, namespace: string) => {
  const snapshot = buildTopologySnapshot(plan);
  const groupedByService = new Map<string, number>();
  for (const node of snapshot.nodesById.values()) {
    const previous = groupedByService.get(node.serviceCode) ?? 0;
    groupedByService.set(node.serviceCode, previous + 1);
  }

  const topServices = Array.from(groupedByService.entries())
    .map(([serviceCode, count]) => ({ serviceCode, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  return {
    namespace,
    nodeCount: snapshot.nodeCount,
    heatScore: snapshot.heatScore,
    topServices,
    criticalNodes: snapshot.orderedByCriticality.slice(0, 3),
  };
};

export const toCriticalServiceMatrix = (plans: readonly RecoveryPlan[]) => {
  const rows: Array<{ namespace: string; service: string; count: number; criticality: ServiceCriticality }> = [];
  for (const plan of plans) {
    const summary = summarizeTopology(plan, plan.labels.short);
    for (const node of summary.criticalNodes) {
      const serviceNode = snapshotNode(plan, node);
      const entry = rows.find((item) => item.service === serviceNode.serviceCode);
      if (!entry) {
        rows.push({
          namespace: summary.namespace,
          service: serviceNode.serviceCode,
          count: 1,
          criticality: serviceNode.criticality,
        });
      } else {
        entry.count += 1;
      }
    }
  }
  return rows.sort((left, right) => right.count - left.count);
};

export const snapshotNode = (plan: RecoveryPlan, nodeId: EntityId): ServiceTopologyNode => {
  const found = plan.actions.find((action) => action.id === nodeId);
  if (!found) {
    throw new Error(`node ${nodeId} not found`);
  }
  return toNode(plan, found);
};

const summarizeTags = (nodes: readonly ServiceTopologyNode[]): Readonly<Record<ServiceTag, number>> => {
  const record = new Map<ServiceTag, number>([
    ['edge', 0],
    ['database', 0],
    ['control-plane', 0],
    ['stateful', 0],
    ['stateless', 0],
  ]);
  for (const node of nodes) {
    for (const tag of node.tags) {
      record.set(tag, (record.get(tag) ?? 0) + 1);
    }
  }
  const output: Record<ServiceTag, number> = {
    edge: record.get('edge') ?? 0,
    database: record.get('database') ?? 0,
    'control-plane': record.get('control-plane') ?? 0,
    stateful: record.get('stateful') ?? 0,
    stateless: record.get('stateless') ?? 0,
  };
  return output;
};

