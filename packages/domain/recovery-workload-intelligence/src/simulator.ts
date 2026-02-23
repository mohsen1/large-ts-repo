import type {
  ForecastInput,
  WorkloadDependencyGraph,
  WorkloadNode,
  WorkloadSnapshot,
  WorkloadUnitId,
} from './types';
import { buildTopology } from './topology';
import { buildPlanningPlan } from './planning';
import { summarizeSignals } from './signals';
import { calculateCoverageForWindow } from './coverage';

export interface SimulationSnapshot {
  readonly nodeId: WorkloadNode['id'];
  readonly at: string;
  readonly recommendedDelayMs: number;
  readonly signalDensity: number;
  readonly dominantSignal: string;
}

export interface SimulationPlan {
  readonly runId: string;
  readonly nodeId: WorkloadNode['id'];
  readonly timestamp: string;
  readonly snapshots: readonly SimulationSnapshot[];
  readonly warnings: readonly string[];
  readonly coverage: number;
}

export interface SimulatorInput {
  readonly snapshot: ForecastInput[];
  readonly graph: WorkloadDependencyGraph;
}

export interface SimulationResult {
  readonly plans: readonly SimulationPlan[];
  readonly queue: readonly WorkloadNode['id'][];
  readonly hotNodes: readonly WorkloadUnitId[];
}

const nextDelay = (snapshot: WorkloadSnapshot): number => {
  const saturation = (snapshot.cpuUtilization + snapshot.iopsUtilization + snapshot.errorRate) / 3;
  if (saturation > 100) {
    return 3_000;
  }
  if (saturation > 80) {
    return 1_500;
  }
  if (saturation > 60) {
    return 600;
  }
  return 250;
};

const toPlanRow = (input: ForecastInput): SimulationSnapshot => {
  const profile = summarizeSignals(input.node, [input.snapshot]);
  return {
    nodeId: input.node.id,
    at: input.snapshot.timestamp,
    recommendedDelayMs: nextDelay(input.snapshot),
    signalDensity: profile.signalDensity,
    dominantSignal: profile.dominantSignal,
  };
};

const collectWarnings = (
  inputs: readonly ForecastInput[],
  graph: WorkloadDependencyGraph,
): string[] => {
  const warnings: string[] = [];
  if (graph.nodes.length !== [...new Set(graph.nodes.map((node) => node.id))].length) {
    warnings.push('graph node ids are not unique');
  }
  if (inputs.some((entry) => entry.riskVector.severity >= 5)) {
    warnings.push('max severity input detected');
  }
  return warnings;
};

const buildRunQueue = (graph: WorkloadDependencyGraph): readonly WorkloadNode['id'][] => {
  const topology = buildTopology(graph);
  return topology.nodes
    .slice()
    .sort((left, right) => {
      if (left.criticality !== right.criticality) {
        return right.criticality - left.criticality;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.outbound - right.outbound;
    })
    .map((entry) => entry.id);
  };

export const simulateWorkloadDrill = ({ snapshot, graph }: SimulatorInput): SimulationResult => {
  const warnings = collectWarnings(snapshot, graph);
  const topology = buildTopology(graph);
  const plans: SimulationPlan[] = snapshot.map((entry, index) => {
    const row = toPlanRow(entry);
    const plan = buildPlanningPlan(entry.node, [entry.snapshot], graph);
    const coverage = calculateCoverageForWindow(graph, [entry.snapshot]).overall;
    return {
      runId: `${entry.node.id}-run-${index + 1}`,
      nodeId: entry.node.id,
      timestamp: entry.snapshot.timestamp,
      snapshots: [row],
      warnings: [...warnings],
      coverage,
    };
  });

  return {
    plans,
    queue: [...topology.orderedRoots, ...topology.nodes.map((entry) => entry.id)],
    hotNodes: plans
      .filter((entry) => entry.coverage < 0.5)
      .map((entry) => entry.nodeId),
  };
};
