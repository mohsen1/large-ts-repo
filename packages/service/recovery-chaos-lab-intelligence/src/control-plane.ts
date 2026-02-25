import {
  computeEdgeIndex,
  connectedComponents,
  normalizeTopology,
  pruneTopology,
  type TopologyEdge,
  type TopologyNode
} from '@domain/recovery-chaos-sim-models';
import {
  mapSignalsToBatches,
  runScenarioWithReport,
  type RuntimeConfig,
  type RuntimeRunInput
} from './orchestrator-runtime';
import type { ChaosRunReport } from '@service/recovery-chaos-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { asRunToken, type ChaosRunToken } from '@domain/recovery-chaos-sim-models';

export interface ControlPlaneInput<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: string;
  readonly scenario: { id: string; stages: TStages };
  readonly topology: {
    readonly nodes: readonly TopologyNode[];
    readonly edges: readonly TopologyEdge[];
  };
  readonly registry: RuntimeRunInput<TStages>['registry'];
  readonly config: RuntimeConfig;
}

export interface ControlPlaneRun<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly runToken: ChaosRunToken;
  readonly stages: TStages;
  readonly topologyNodes: number;
  readonly topologyEdges: number;
  readonly isolatedNodes: number;
  readonly report: ChaosRunReport<TStages>;
}

export interface ControlPlaneTelemetry {
  readonly state: string;
  readonly batches: number;
  readonly signalCount: number;
}

export async function analyzeTopology(
  topology: {
    nodes: readonly TopologyNode[];
    edges: readonly TopologyEdge[];
  }
): Promise<{ readonly nodes: number; readonly edges: number; readonly isolated: number; readonly signature: string }> {
  const normalized = normalizeTopology(topology.nodes, topology.edges);
  const index = computeEdgeIndex(normalized.edges);
  const groups = connectedComponents(normalized.nodes, normalized.edges);
  const disconnected = normalized.nodes.filter((node) => (index.get(node.id) ?? []).length === 0).length;
  const signature = normalized.edges
    .map((edge) => `${edge.from}->${edge.to}`)
    .sort()
    .join('|');

  return {
    nodes: normalized.nodes.length,
    edges: normalized.edges.length,
    isolated: Math.max(disconnected, groups.length === 0 ? 0 : groups.length - 1),
    signature
  };
}

export async function runControlPlane<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  input: ControlPlaneInput<TStages>
): Promise<Result<ControlPlaneRun<TStages>, Error>> {
  const runToken = asRunToken(`${input.namespace}:${input.scenario.id}:${Date.now()}`);
  const topologySummary = await analyzeTopology(input.topology);
  const normalized = pruneTopology(normalizeTopology(input.topology.nodes, input.topology.edges), 0);
  const runInput: RuntimeRunInput<TStages> = {
    namespace: input.namespace,
    scenario: input.scenario,
    registry: input.registry,
    config: input.config
  };

  const reportResult = await runScenarioWithReport(runInput);
  if (!reportResult.ok) {
    return fail(reportResult.error);
  }

  const chunks = await mapSignalsToBatches(
    [
      {
        streamId: input.namespace,
        cursor: 0,
        signals: [
          {
            kind: 'infra::INFRA',
            priority: 1,
            namespace: input.namespace as never,
            simulationId: input.scenario.id as never,
            scenarioId: input.scenario.id as never,
            payload: { source: 'control-plane' },
            at: Date.now()
          }
        ]
      }
    ],
    input.config.signalBatchSize
  );

  return ok({
    runToken,
    stages: input.scenario.stages,
    topologyNodes: normalized.nodes.length,
    topologyEdges: normalized.edges.length,
    isolatedNodes: topologySummary.isolated,
    report: reportResult.value
  });
}

export function buildTelemetry(chunks: readonly unknown[], events: number): ControlPlaneTelemetry {
  return {
    state: 'ok',
    batches: chunks.length,
    signalCount: chunks.length * events
  };
}
