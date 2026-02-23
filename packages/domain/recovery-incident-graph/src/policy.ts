import type {
  IncidentGraph,
  PlannerConfig,
  PlannerInstruction,
  PlannerProfile,
  PolicyRule,
  ReadinessSignal,
  ReadinessSignalId,
} from './types';
import { topologicalLevels } from './graph';
import { inspectReachability } from './simulation';

const defaultRules = (): ReadonlyArray<PolicyRule> => [
  {
    id: 'risk-stop' as any,
    name: 'risk-stop',
    description: 'Block red and orange risk nodes',
    condition: (node) => node.riskBand === 'red' || node.riskBand === 'orange',
    onMatch: (node) => ({ state: 'blocked' } as Partial<typeof node>),
  },
  {
    id: 'boost-green' as any,
    name: 'boost-green',
    description: 'Keep green band nodes ready',
    condition: (node) => node.riskBand === 'green',
    onMatch: (node) => ({ score: Math.min(100, node.score + 5) } as Partial<typeof node>),
  },
];

const applyRule = (node: any, rule: PolicyRule): any => {
  return {
    ...node,
    ...rule.onMatch(node),
  };
};

export const applyRules = (graph: IncidentGraph): IncidentGraph => {
  const rules = defaultRules();
  const nodes = graph.nodes.map((node) => {
    const matching = rules.filter((rule) => rule.condition(node));
    return matching.reduce(applyRule, node);
  });
  return { ...graph, nodes };
};

export interface RuleDecision {
  readonly ruleId: string;
  readonly accepted: boolean;
  readonly reason: string;
}

export interface PolicyReport {
  readonly decisions: readonly RuleDecision[];
  readonly allowExecution: boolean;
  readonly overrides: readonly ReadinessSignal[];
}

export const evaluatePolicies = (graph: IncidentGraph, context: { profile: PlannerProfile }): PolicyReport => {
  const redNodes = graph.nodes.filter((node) => node.riskBand === 'red');
  const graphLevels = topologicalLevels(graph);
  const allowExecution = redNodes.length < Math.max(1, Math.floor(graph.nodes.length * 0.4)) && graphLevels.length > 0;

  const decisions: RuleDecision[] = defaultRules().map((rule) => ({
    ruleId: String(rule.id),
    accepted: true,
    reason: rule.name,
  }));

  const overrides: ReadinessSignal[] = graph.nodes.slice(0, 3).map((node, index) => ({
    id: `${node.id}-signal` as ReadinessSignalId,
    targetNodeId: node.id,
    value: Math.max(0, 1 - context.profile.maxParallelism / 10 + index * 0.01),
    reason: `policy-${context.profile.profileName}`,
    createdAt: new Date().toISOString(),
    createdBy: 'policy-engine',
  }));

  const reachable = inspectReachability(graph, graph.nodes[0]?.id ?? ('' as any));
  if (reachable.length === 0) {
    decisions.push({ ruleId: 'reachability-empty', accepted: false, reason: 'no reachable nodes' });
  }

  return {
    decisions,
    allowExecution,
    overrides,
  };
};

export const enforceMaxParallelism = (
  instructions: readonly PlannerInstruction[],
  config: PlannerConfig,
): readonly PlannerInstruction[] => {
  const maxParallelism = Math.max(1, config.profile.maxParallelism);
  return instructions.map((instruction, index) => {
    const adjusted = Math.floor(index / maxParallelism);
    return {
      ...instruction,
      phase: adjusted,
      startAtOffsetMinutes: adjusted * 5,
    };
  });
};

export const createPolicyIdentity = (): string => {
  return `${Date.now().toString(36)}-policy`;
};

export const computeRiskAdjustments = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
};
