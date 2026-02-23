import type { ForgeExecutionReport, ForgeTopology, ForgePolicyResult, ForgePolicyGate, ForgeScenario } from '@domain/recovery-command-forge';

export const mapTopologyToRows = (topology: ForgeTopology): readonly { readonly label: string; readonly progress: number }[] =>
  topology.nodes.map((node) => ({
    label: node.node.label,
    progress: node.progress,
  }));

export const pickPolicySummary = (policy: ForgePolicyResult): string =>
  `${policy.urgency.toUpperCase()} | score=${policy.riskScore} | pass=${policy.pass ? 'yes' : 'no'}`;

export const mapPolicySections = (policy: ForgePolicyResult): readonly { summary: string; gates: readonly ForgePolicyGate[]; passRate: number; passCount: number }[] => {
  const chunkSize = 2;
  const entries = policy.gates;
  const sections: { summary: string; gates: readonly ForgePolicyGate[]; passRate: number; passCount: number }[] = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    const slice = entries.slice(index, index + chunkSize);
    const passCount = slice.filter((entry) => entry.passRate >= entry.threshold).length;
    sections.push({
      summary: `Policy window ${index / chunkSize + 1}`,
      gates: slice,
      passRate: slice.length ? Number((slice.reduce((acc, item) => acc + item.passRate, 0) / slice.length).toFixed(2)) : 0,
      passCount,
    });
  }

  return sections;
};

export const buildNodeStates = (report: ForgeExecutionReport): readonly { nodeId: string; hasRisk: boolean; readinessDelta: number }[] =>
  report.topologies.flatMap((topology) =>
    topology.nodes.map((state) => ({
      nodeId: state.node.id,
      hasRisk: state.progress > 70,
      readinessDelta: Number(((state.node.expectedDurationMinutes / Math.max(1, topology.nodes.length)) * 1.1).toFixed(2)),
    })),
  );

export const aggregatePolicy = (scenarios: readonly ForgeScenario[]): { readonly passRate: number; readonly nodes: number } => {
  const nodeCount = scenarios.reduce((acc, scenario) => acc + scenario.planSnapshot.constraints.maxParallelism, 0);
  const passRate = scenarios.length ? Math.min(1, scenarios.length / Math.max(1, scenarios.length * 2)) : 0;
  return { passRate, nodes: nodeCount };
};
