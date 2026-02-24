import { RecoveryAction, RecoveryPlan } from '@domain/recovery-cockpit-models';
import { groupBy, movingAverage, normalizeNumber } from '@shared/util';

export type PhaseWindow = 'preflight' | 'critical' | 'stabilization';

export type ScenarioNode = Readonly<{
  readonly actionId: string;
  readonly serviceCode: string;
  readonly region: string;
  readonly desiredState: RecoveryAction['desiredState'];
  readonly riskFactor: number;
  readonly durationMinutes: number;
  readonly dependsOn: readonly string[];
  readonly dependents: readonly string[];
  readonly phase: PhaseWindow;
  readonly tags: ReadonlyArray<string>;
}>;

export type ScenarioTopology = Readonly<{
  readonly planId: RecoveryPlan['planId'];
  readonly nodes: readonly ScenarioNode[];
  readonly order: readonly string[];
  readonly bottlenecks: readonly string[];
  readonly regionalConcurrency: ReadonlyArray<{
    readonly region: string;
    readonly actionCount: number;
    readonly totalMinutes: number;
    readonly parallelBudget: number;
  }>;
  readonly readinessWindowMinutes: ReadonlyArray<{ readonly phase: PhaseWindow; readonly minutes: number }>; 
}>;

const classifyPhase = (index: number, total: number): PhaseWindow => {
  if (index < total * 0.25) return 'preflight';
  if (index < total * 0.75) return 'critical';
  return 'stabilization';
};

const normalizedActionRisk = (action: RecoveryAction, index: number, total: number): number => {
  const base = action.tags.includes('critical') ? 0.9 : 0.4;
  const duration = Math.min(1, action.expectedDurationMinutes / 180);
  const complexity = Math.min(1, action.tags.length / 4);
  const orderBias = total === 0 ? 0 : index / total;
  return Number(((base + duration + complexity + orderBias) / 3).toFixed(3));
};

const phaseMinutes = (nodes: ReadonlyArray<ScenarioNode>): ReadonlyArray<{ phase: PhaseWindow; minutes: number }> => {
  const total = nodes.length === 0 ? 1 : nodes.length;
  const buckets = nodes.reduce(
    (acc, node, index) => {
      const phase = classifyPhase(index, total);
      const item = (acc[phase] ?? 0) + node.durationMinutes;
      return { ...acc, [phase]: item };
    },
    {} as Record<PhaseWindow, number>,
  );

  return [
    { phase: 'preflight', minutes: buckets.preflight ?? 0 },
    { phase: 'critical', minutes: buckets.critical ?? 0 },
    { phase: 'stabilization', minutes: buckets.stabilization ?? 0 },
  ];
};

const nodeForAction = (
  action: RecoveryAction,
  index: number,
  total: number,
  dependentsById: Map<string, string[]>,
): ScenarioNode => ({
  actionId: action.id,
  serviceCode: action.serviceCode,
  region: action.region,
  desiredState: action.desiredState,
  riskFactor: normalizedActionRisk(action, index, total),
  durationMinutes: action.expectedDurationMinutes,
  dependsOn: action.dependencies,
  dependents: dependentsById.get(action.id) ?? [],
  phase: classifyPhase(index, total),
  tags: action.tags,
});

const buildDependencyIndex = (actions: readonly RecoveryAction[]): Map<string, string[]> => {
  const dependents = new Map<string, string[]>();
  for (const action of actions) {
    dependents.set(action.id, []);
  }
  for (const action of actions) {
    for (const dep of action.dependencies) {
      const bucket = dependents.get(dep);
      if (bucket) {
        bucket.push(action.id);
      }
    }
  }
  return dependents;
};

const buildTopologyGraph = (plan: RecoveryPlan): {
  readonly adjacency: Map<string, string[]>;
  readonly reverse: Map<string, string[]>;
} => {
  const adjacency = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const action of plan.actions) {
    adjacency.set(action.id, []);
    reverse.set(action.id, []);
  }
  for (const action of plan.actions) {
    for (const dependency of action.dependencies) {
      adjacency.get(dependency)?.push(action.id);
      reverse.get(action.id)?.push(dependency);
    }
  }
  return { adjacency, reverse };
};

const inferBottlenecks = (plan: RecoveryPlan): readonly string[] => {
  const byRegion = groupBy(plan.actions, (action) => action.region);
  const regionRank = byRegion
    .map((entry) => ({ region: entry.key, minutes: entry.values.reduce((acc, item) => acc + item.expectedDurationMinutes, 0) }))
    .sort((left, right) => right.minutes - left.minutes)
    .slice(0, 2)
    .map((entry) => entry.region);

  const nodesWithDeps = plan.actions
    .filter((action) => action.dependencies.length > 1)
    .sort((left, right) => right.dependencies.length - left.dependencies.length)
    .slice(0, 2)
    .map((action) => action.id);

  const graph = buildTopologyGraph(plan);
  const fanOutCount = [...graph.adjacency.values()].map((next) => next.length);
  const maxFanOut = Math.max(0, ...fanOutCount);
  const fanOut = plan.actions
    .filter((action) => (graph.adjacency.get(action.id)?.length ?? 0) >= maxFanOut)
    .map((action) => action.id)
    .slice(0, 2);

  return [...new Set([...regionRank, ...nodesWithDeps, ...fanOut])];
};

export const buildScenarioTopology = (plan: RecoveryPlan): ScenarioTopology => {
  const dependentsById = buildDependencyIndex(plan.actions);
  const ordered = [...plan.actions]
    .sort((left, right) => right.expectedDurationMinutes - left.expectedDurationMinutes)
    .map((action, index, list) => nodeForAction(action, index, list.length, dependentsById));

  const regionalBuckets = groupBy(ordered, (entry) => entry.region);

  const regionalConcurrency = regionalBuckets.map((bucket) => {
    const loadMinutes = bucket.values.reduce((acc, item) => acc + item.durationMinutes, 0);
    const safeWindow = Math.max(1, bucket.values.length);
    const parallelBudget = normalizeNumber(Math.min(3, safeWindow > 0 ? Math.sqrt(loadMinutes / safeWindow) : 1));
    return {
      region: bucket.key,
      actionCount: bucket.values.length,
      totalMinutes: loadMinutes,
      parallelBudget,
    };
  });

  const phaseReadiness = phaseMinutes(ordered);
  const topological = [...plan.actions].map((action) => action.id).filter((id) => id.length > 0);

  return {
    planId: plan.planId,
    nodes: ordered,
    order: topological,
    bottlenecks: inferBottlenecks(plan),
    regionalConcurrency,
    readinessWindowMinutes: phaseReadiness,
  };
};

export const topologyRiskProfile = (topology: ScenarioTopology): ReadonlyArray<{ node: string; risk: number }> => {
  const rolling = movingAverage(topology.nodes.map((node) => node.riskFactor * 100), 4);
  return topology.nodes.map((node, index) => ({
    node: node.actionId,
    risk: normalizeNumber((rolling[index] ?? node.riskFactor * 100) / 100),
  }));
};

export const summarizeTopology = (topology: ScenarioTopology): string => {
  const critical = topology.nodes.filter((node) => node.tags.includes('critical')).length;
  const maxRisk = Math.max(...topology.nodes.map((node) => node.riskFactor), 0);
  const totalMinutes = topology.nodes.reduce((acc, node) => acc + node.durationMinutes, 0);
  return `${topology.planId}: ${topology.nodes.length} nodes, ${critical} critical, ${totalMinutes}m, maxRisk=${maxRisk.toFixed(2)}`;
};
