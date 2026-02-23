import type {
  IncidentGraph,
  IncidentGraphNode,
  ReadinessSignal,
  ReadinessSignalId,
  RuntimeEvent,
  SimulationSummary,
  TopologyHeatPoint,
} from './types';
import type { GraphAnalysisReport } from './types';
import { buildGraphAnalysisReport, calculateRiskHotspots } from './analysis';
import { calculateReadinessScore } from './analysis';

export interface AdapterEnvelope<TPayload> {
  readonly envelopeId: string;
  readonly payload: TPayload;
  readonly receivedAt: string;
}

export interface ExternalIncidentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly state: IncidentGraphNode['state'];
  readonly score: number;
}

export interface ExternalPolicyInput {
  readonly policyId: string;
  readonly tenantId: string;
  readonly maxRetries: number;
  readonly allowOverrides: boolean;
}

export interface ExternalPolicyEnvelope {
  readonly kind: 'policy-input';
  readonly envelope: AdapterEnvelope<ExternalPolicyInput>;
}

export interface ReadinessSignalRecord {
  readonly id: string;
  readonly targetNodeId: string;
  readonly value: number;
  readonly reason: string;
}

export const toReadinessSignal = (input: ReadinessSignalRecord): ReadinessSignal => {
  return {
    id: input.id as ReadinessSignalId,
    targetNodeId: input.targetNodeId as IncidentGraphNode['id'],
    value: Math.max(0, Math.min(1, input.value)),
    reason: input.reason,
    createdAt: new Date().toISOString(),
    createdBy: 'adapter',
  };
};

export const mapExternalToInternalSignals = (inputs: readonly ReadinessSignalRecord[]): readonly ReadinessSignal[] =>
  inputs.map(toReadinessSignal);

export const toReadinessState = (graph: IncidentGraph) => {
  const score = calculateReadinessScore(graph);
  return {
    graphId: graph.meta.id,
    at: new Date().toISOString(),
    score,
    trend: graph.nodes.map((node) => node.score / 100),
    signals: mapExternalToInternalSignals(
      graph.nodes.map((node) => ({
        id: `${node.id}-risk`,
        targetNodeId: node.id,
        value: node.score / 100,
        reason: node.state,
      })),
    ),
  };
};

export const toRuntimeEvent = (summary: SimulationSummary): RuntimeEvent => ({
  eventId: `${summary.failedNodeCount}-${summary.completedNodeCount}` as RuntimeEvent['eventId'],
  runId: `${summary.failedNodeCount}-${summary.warningNodeCount}` as RuntimeEvent['runId'],
  nodeId: summary.triggeredSignals[0] as unknown as IncidentGraphNode['id'],
  type: 'state-change',
  at: new Date().toISOString(),
  payload: {
    completed: summary.completedNodeCount,
    failed: summary.failedNodeCount,
    warnings: summary.warningNodeCount,
  },
});

export const mapRiskAssessmentToHeatPoints = (graph: IncidentGraph): readonly TopologyHeatPoint[] => {
  const hotspots = calculateRiskHotspots(graph);
  return hotspots.map((hotspot) => ({ ...hotspot, depth: Math.max(1, hotspot.depth) }));
};

export const normalizeIncidentGraph = (graph: IncidentGraph): IncidentGraph => {
  const nodes = graph.nodes
    .map((node) => ({
      ...node,
      payload: {
        ...node.payload,
        metadata: { ...node.payload.metadata },
      },
      labels: node.payload.labels,
      dependsOn: [...node.dependsOn],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const edges = [...graph.edges]
    .filter((edge) => edge.fromNodeId !== edge.toNodeId)
    .map((edge) => ({
      ...edge,
      weight: Math.max(0.25, edge.weight),
    }));

  return {
    ...graph,
    nodes,
    edges,
  };
};

export const buildAnalysisReport = (graph: IncidentGraph): GraphAnalysisReport => buildGraphAnalysisReport(graph);

export const parseIncidentRecord = (record: ExternalIncidentRecord): IncidentGraphNode | undefined => {
  if (!record.id || !record.title || record.score < 0) {
    return undefined;
  }

  return {
    id: record.id as IncidentGraphNode['id'],
    tenantId: record.tenantId,
    title: record.title,
    state: record.state,
    score: record.score,
    riskBand: record.score > 80 ? 'green' : record.score > 60 ? 'yellow' : record.score > 40 ? 'orange' : 'red',
    policyIds: [],
    dependsOn: [],
    readinessAt: new Date().toISOString(),
    payload: {
      type: 'adapted',
      labels: ['adapted'],
      metadata: { imported: true },
      controls: ['resume', 'pause'],
    },
    durationMinutes: 12,
  };
};

export const parseIncidentList = (
  incoming: readonly ExternalIncidentRecord[],
): readonly (IncidentGraphNode | undefined)[] => incoming.map(parseIncidentRecord);
