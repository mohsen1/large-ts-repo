import type { ForecastInput, WorkloadDependencyGraph, WorkloadNode } from '@domain/recovery-workload-intelligence';
import { buildPlanningPlan, prioritizePlans, safeRiskClass } from '@domain/recovery-workload-intelligence';
import type {
  ForecastPlan,
  ForecastResponse,
  OrchestratorMode,
} from './types';

export interface BuildForecastInput {
  readonly nodeInputs: readonly ForecastInput[];
  readonly mode: OrchestratorMode;
  readonly graph: WorkloadDependencyGraph;
}

const describeMode = (mode: OrchestratorMode): string => {
  if (mode === 'drill') {
    return 'full-drill';
  }
  if (mode === 'plan-only') {
    return 'analysis-only';
  }
  return 'simulate';
};

const scoreLabel = (value: number): string => `${Math.round(value * 100)} / ${Math.round((1 - value) * 100)}`;

const pickNodeInputs = (nodeInputs: readonly ForecastInput[]): ReadonlyMap<string, ForecastInput[]> => {
  const grouped = new Map<string, ForecastInput[]>();
  for (const input of nodeInputs) {
    const existing = grouped.get(input.node.id) ?? [];
    grouped.set(input.node.id, [...existing, input]);
  }
  return grouped;
};

const buildSafeGraph = (graph: WorkloadDependencyGraph, node: WorkloadNode): WorkloadDependencyGraph => {
  if (graph.nodes.some((entry) => entry.id === node.id)) {
    return graph;
  }
  return {
    nodes: [node],
    edges: [],
  };
};

export const buildForecasts = ({ nodeInputs, mode, graph }: BuildForecastInput): ForecastResponse => {
  const grouped = pickNodeInputs(nodeInputs);
  const entries: Array<{ plan: ForecastPlan; score: number }> = [];

  for (const inputs of grouped.values()) {
    const first = inputs[0];
    if (!first) {
      continue;
    }

    const safeGraph = buildSafeGraph(graph, first.node);
    const plan = buildPlanningPlan(first.node, inputs.map((entry) => entry.snapshot), safeGraph);
    const risk = safeRiskClass(plan.riskProfiles[0]?.riskScore ?? 0);
    entries.push({
      score: plan.riskProfiles[0]?.riskScore ?? 0,
      plan: {
        plan,
        recommendation: `${plan.windowKey} | ${describeMode(mode)} | ${risk} | top risk ${scoreLabel(plan.riskProfiles[0]?.riskScore ?? 0)}`,
      },
    });
  }

  const ranked = prioritizePlans(entries.map((entry) => entry.plan.plan));
  return {
    planGroups: ranked.map((plan) => {
      const entry = entries.find((item) => item.plan.plan.node.id === plan.node.id);
      return {
        plan,
        recommendation: `${entry?.plan.recommendation} | score=${entry?.score ?? 0}`,
      };
    }),
    warnings: entries
      .filter((entry) => safeRiskClass(entry.score) === 'critical')
      .map((entry) => `critical risk for ${entry.plan.plan.node.name}`),
  };
};

export const forecastSummary = (forecast: ForecastResponse): string => {
  return `plans=${forecast.planGroups.length} warnings=${forecast.warnings.length}`;
};
