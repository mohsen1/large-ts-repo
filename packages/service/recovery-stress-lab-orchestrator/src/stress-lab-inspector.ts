import { type FleetRunResult, type FleetRunOptions, executeFleet, parseFleetInput } from './stress-lab-fleet';
import { type WorkflowGraph, collectTraversal, type WorkloadSignal } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { summarizeByLaneCount } from '@domain/recovery-stress-lab-intelligence/flow-graph';

export interface FleetInspectionConfig {
  tenant: string;
  zone: string;
  graph: ReturnType<typeof parseFleetInput>;
  scripts: readonly string[];
  strategyInput: FleetRunOptions['strategyInput'];
}

export interface FleetInspection {
  readonly ok: boolean;
  readonly runId: string;
  readonly laneSignature: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly traversalLength: number;
  readonly scriptLineCount: number;
  readonly signalProfile: Record<string, number>;
}

const signalProfile = (signals: readonly WorkloadSignal[]): Record<string, number> => {
  const buckets: Record<string, number> = {};
  for (const signal of signals) {
    buckets[signal.lane] = (buckets[signal.lane] ?? 0) + 1;
  }
  return buckets;
};

const formatLaneCount = <TGraph extends WorkflowGraph>(graph: TGraph): string => {
  const byLane = summarizeByLaneCount(graph);
  return [
    byLane.observe,
    byLane.prepare,
    byLane.simulate,
    byLane.recommend,
    byLane.report,
    byLane.restore,
    byLane.verify,
    byLane.retrospective,
  ].join('-');
};

export const inspectFleet = async (input: FleetInspectionConfig): Promise<FleetInspection> => {
  const run = await executeFleet({
    tenant: input.tenant,
    zone: input.zone,
    graph: input.graph,
    scripts: input.scripts,
    strategyInput: input.strategyInput,
  });

  const traversalLength = collectTraversal(run.graph, run.graph.nodes[0]?.id).length;
  const profile = signalProfile(run.strategy.payload.signals);

  return {
    ok: run.summary.recommendations > 0,
    runId: run.runId,
    laneSignature: formatLaneCount(run.graph),
    nodeCount: run.graph.nodes.length,
    edgeCount: run.graph.edges.length,
    traversalLength,
    scriptLineCount: input.scripts.join('\n').split('\n').length,
    signalProfile: profile,
  };
};

export const inspectFleetQuick = async (
  tenant: string,
  zone: string,
  graph: FleetInspectionConfig['graph'],
): Promise<number> => {
  const result = await executeFleet({
    tenant,
    zone,
    graph,
    scripts: ['start\nwait\nvalidate'],
    strategyInput: {
      tenant,
      runId: `${tenant}::quick`,
      signals: [] as never,
      forecastScore: 0.5,
    },
  });
  return result.summary.nodes + result.summary.edges;
};

export const toSummaryRecord = async (input: FleetInspectionConfig): Promise<{ readonly passed: boolean; readonly report: string }> => {
  const inspection = await inspectFleet(input);
  return {
    passed: inspection.ok,
    report: `${inspection.runId}|${inspection.scriptLineCount}|${inspection.laneSignature}`,
  };
};

export const summarizeByPlan = (input: FleetRunResult): string => `${input.summary.nodes}:${input.summary.edges}:${input.summary.signals}`;
