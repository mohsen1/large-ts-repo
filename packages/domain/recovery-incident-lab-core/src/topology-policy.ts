import type { StepId, LabNodeLink, LabGraph, IncidentLabScenario, IncidentLabPlan, IncidentLabSignal, SeverityBand } from './types';

export interface PolicyDimension<T = string> {
  readonly id: string;
  readonly tier: T;
  readonly weight: number;
}

export interface ConstraintRule<T extends string = string> {
  readonly key: T;
  readonly min: number;
  readonly max: number;
  readonly critical: boolean;
}

export interface GraphPolicyProfile {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly dimensions: readonly PolicyDimension[];
  readonly rules: readonly ConstraintRule[];
}

export type PressureClass = 'nominal' | 'warning' | 'critical';

export interface TopologyGate {
  readonly node: StepId;
  readonly className: PressureClass;
  readonly load: number;
}

export interface TopologyPolicy {
  readonly profile: GraphPolicyProfile;
  readonly gates: readonly TopologyGate[];
  readonly isSafe: boolean;
  readonly reason: readonly string[];
}

export const buildPressureProfile = (graph: LabGraph): readonly [StepId, number][] =>
  graph.nodes.map((node) => {
    const incoming = graph.links.filter((link) => link.to === node).length;
    const outgoing = graph.links.filter((link) => link.from === node).length;
    const pressure = Math.max(0.25, incoming + outgoing);
    return [node, pressure];
  });

export const makeTopologyPolicy = (scenario: IncidentLabScenario, graph: LabGraph): TopologyPolicy => {
  const pressureProfile = buildPressureProfile(graph);
  const maxPressure = Math.max(...pressureProfile.map(([, value]) => value), 0.25);
  const gates: TopologyGate[] = pressureProfile.map(([node, pressure]) => {
    const normalized = pressure / maxPressure;
    const className: PressureClass = normalized > 0.8 ? 'critical' : normalized > 0.5 ? 'warning' : 'nominal';
    return { node, className, load: Number(normalized.toFixed(2)) };
  });

  const reasons: string[] = [];
  if (gates.some((gate) => gate.className === 'critical')) {
    reasons.push('critical-pressure-topology');
  }
  if (graph.links.length > graph.nodes.length * 2) {
    reasons.push('dense-dependency-graph');
  }
  if (scenario.steps.length > 20) {
    reasons.push('large-workplan');
  }

  return {
    profile: buildPolicyProfile(scenario, gates),
    gates,
    isSafe: reasons.length === 0,
    reason: reasons,
  };
};

const buildPolicyProfile = (
  scenario: IncidentLabScenario,
  gates: readonly TopologyGate[],
): GraphPolicyProfile => ({
  scenarioId: scenario.id,
  dimensions: [
    {
      id: 'throughput',
      tier: 'execution',
      weight: 0.35,
    },
    {
      id: 'integrity',
      tier: 'quality',
      weight: 0.25,
    },
    {
      id: 'latency',
      tier: 'experience',
      weight: 0.15,
    },
    {
      id: 'blast-radius',
      tier: 'risk',
      weight: 0.25,
    },
  ] as const,
  rules: [
    {
      key: 'link-pressure',
      min: 0,
      max: 3,
      critical: gates.some((gate) => gate.className === 'critical'),
    },
    {
      key: 'plan-depth',
      min: 1,
      max: 50,
      critical: scenario.steps.length > 50,
    },
  ],
});

export const policyHeatMap = (policy: TopologyPolicy): Record<PressureClass, StepId[]> => {
  const map: Record<PressureClass, StepId[]> = { nominal: [], warning: [], critical: [] };
  for (const gate of policy.gates) {
    map[gate.className] = [...map[gate.className], gate.node];
  }
  return map;
};

export const summarizePolicyCoverage = (plan: IncidentLabPlan): string =>
  `policy=coverage id=${plan.id} state=${plan.state} selected=${plan.selected.length} queued=${plan.queue.length}`;

export const inferSeverityBandByLoad = (load: number, severity: SeverityBand): IncidentLabScenario['severity'] => {
  if (load < 0.4) {
    return severity === 'low' || severity === 'medium' ? severity : 'medium';
  }
  if (load < 0.75) {
    return severity === 'critical' || severity === 'critical+' ? 'high' : severity;
  }
  return severity === 'critical+' ? 'critical+' : 'critical';
};

export const withSignalBudget = (signals: readonly IncidentLabSignal[], capacity: number): readonly IncidentLabSignal[] =>
  signals
    .filter((signal) => signal.value >= 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, capacity);
