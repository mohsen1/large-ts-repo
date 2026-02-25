import {
  asNodeId,
  asPlanId,
  asSessionId,
  type SimulationEnvelope,
  type SimulationEnvelopeInput,
  type SimulationPlan,
  type SimulationSignal,
  type SimulationSignalId,
  type SimulationSummary,
  type SimulationTopology,
  buildSummary,
} from './types';

export interface SimulationNode {
  readonly id: string;
  readonly label: string;
  readonly phase: string;
  readonly tags: readonly string[];
}

export interface SimulationArc {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly weight: number;
}

export interface SimulationGraph {
  readonly nodes: readonly SimulationNode[];
  readonly arcs: readonly SimulationArc[];
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  readonly topology: SimulationTopology;
  readonly metadata: {
    readonly routeDigest: string;
    readonly createdAt: string;
    readonly tags: readonly string[];
  };
}

export interface GraphDiagnostics {
  readonly cycleCount: number;
  readonly isolatedCount: number;
  readonly maxOutDegree: number;
  readonly fingerprint: string;
  readonly nodeCount: number;
}

const routePlan = ['discover::0', 'shape::1', 'simulate::2', 'validate::3', 'recommend::4', 'execute::5', 'verify::6', 'close::7'];

const phaseFromLabel = (label: string): string => label.split('::')[0] ?? 'discover';

const signalPriority = (signal: SimulationSignal): number =>
  signal.tier === 'critical' ? 0 : signal.tier === 'warning' ? 1 : signal.tier === 'signal' ? 2 : 3;

const buildNodes = (envelope: SimulationEnvelopeInput): readonly SimulationNode[] => {
  const signalPath = [...envelope.signals]
    .toSorted((left, right) => signalPriority(left) - signalPriority(right))
    .map((signal) => `${signal.tier}:${signal.namespace}`);

  const labels = [...routePlan, ...signalPath];

  return labels.map((entry, index) => ({
    id: String(asNodeId(`${String(envelope.sessionId)}:${index}`)),
    label: entry,
    phase: phaseFromLabel(entry),
    tags: [
      `index:${index}`,
      `phase:${phaseFromLabel(entry)}`,
      `session:${envelope.sessionId}`,
      `windows:${envelope.windows.length}`,
    ],
  }));
};

export const buildSimulationGraph = (
  envelope: SimulationEnvelopeInput,
  topology: SimulationTopology = envelope.topology,
): SimulationGraph => {
  const nodes = buildNodes(envelope);
  const arcs: SimulationArc[] = [];
  const adjacency = new Map<string, readonly string[]>();

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index];
    const right = nodes[index + 1];
    if (!left || !right) {
      continue;
    }

    const arc: SimulationArc = {
      from: left.id,
      to: right.id,
      label: `${left.label}->${right.label}`,
      weight: Math.max(1, (left.label.length + right.label.length) % 5),
    };

    arcs.push(arc);
    adjacency.set(left.id, [...(adjacency.get(left.id) ?? []), right.id]);
  }

  for (const node of nodes) {
    if (!adjacency.has(node.id)) {
      adjacency.set(node.id, []);
    }
  }

  return {
    nodes,
    arcs,
    adjacency,
    topology,
    metadata: {
      routeDigest: `${topology}::${envelope.sessionId}::${nodes.length}`,
      createdAt: new Date().toISOString(),
      tags: ['adaptive', topology, `nodes:${nodes.length}`, `signals:${envelope.signals.length}`],
    },
  };
};

export const createSimulationGraph = buildSimulationGraph;

export const buildGraphDiagnostics = (graph: SimulationGraph): GraphDiagnostics => {
  let maxOut = 0;
  for (const next of graph.adjacency.values()) {
    maxOut = Math.max(maxOut, next.length);
  }

  return {
    cycleCount: Math.max(0, graph.arcs.length - graph.nodes.length + 1),
    isolatedCount: [...graph.adjacency.values()].filter((next) => next.length === 0).length,
    maxOutDegree: maxOut,
    fingerprint: `${graph.metadata.routeDigest}::${graph.nodes.length}:${graph.arcs.length}`,
    nodeCount: graph.nodes.length,
  };
};

export const summarizeGraph = (graph: SimulationGraph, summary: SimulationSummary): {
  readonly routeDigest: string;
  readonly signalDensity: number;
  readonly riskBand: string;
  readonly nodeCount: number;
  readonly arcCount: number;
  readonly nodes: readonly string[];
} => {
  return {
    routeDigest: graph.metadata.routeDigest,
    signalDensity: Number((summary.signalCount / Math.max(graph.nodes.length, 1)).toFixed(3)),
    riskBand: summary.health,
    nodeCount: graph.nodes.length,
    arcCount: graph.arcs.length,
    nodes: graph.nodes.map((node) => node.id),
  };
};

export const normalizeSignalPath = <TSignal extends SimulationSignal>(
  signal: TSignal,
): `${TSignal['tier']}::${TSignal['id']}` => `${signal.tier}::${signal.id}`;

export const buildPlanGraph = (plan: SimulationPlan): {
  readonly plan: SimulationPlan;
  readonly nodes: readonly SimulationNode[];
  readonly arcs: readonly SimulationArc[];
} => {
  const seedSignal: SimulationSignal = {
    id: asSessionId(plan.id) as unknown as SimulationSignalId,
    namespace: 'seed',
    tier: 'signal',
    title: `${plan.title}:seed`,
    score: plan.steps.length,
    confidence: 0.91,
    tags: [{ key: 'origin', value: 'seed' }],
  };
  const input: SimulationEnvelopeInput = {
    sessionId: plan.sessionId,
    plan,
    signals: [seedSignal],
    windows: [],
    topology: 'grid',
    metadata: {
      source: 'plan',
      plan: plan.id,
    },
  };

  const graph = buildSimulationGraph(input, 'grid');
  return {
    plan,
    nodes: graph.nodes,
    arcs: graph.arcs,
  };
};

export const expandSummary = (summaries: readonly SimulationSummary[]): {
  readonly planFingerprint: string;
  readonly averageRisk: number;
  readonly totalSignals: number;
} => {
  const totalSignals = summaries.reduce((count, summary) => count + summary.signalCount, 0);
  const averageRisk = summaries.reduce((count, summary) => count + summary.riskIndex, 0) / Math.max(summaries.length, 1);
  const planFingerprint = summaries
    .toSorted((left, right) => left.sessionId.localeCompare(right.sessionId))
    .map((summary) => summary.sessionId)
    .join('|');

  return {
    planFingerprint,
    averageRisk: Number(averageRisk.toFixed(3)),
    totalSignals,
  };
};

export const buildWindowPlan = (input: readonly SimulationSignal[]): {
  windows: SimulationEnvelopeInput['windows'];
  topologies: readonly SimulationTopology[];
} => {
  const windows = input
    .toSorted((left, right) => right.score - left.score)
    .map((signal, index) => ({
      id: asSessionId(`window:${signal.id}`),
      from: new Date().toISOString(),
      to: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
      timezone: signal.namespace,
      blackoutMinutes: [index],
    }));

  return {
    windows,
    topologies: windows.length > 2 ? ['mesh', 'ring'] : ['grid'],
  };
};

export const summarizeHealth = (signals: readonly SimulationSignal[]): string => {
  const summary = buildSummary({
    sessionId: asSessionId('summary'),
    signals,
  });

  return `${summary.health}:${summary.signalCount}:${summary.riskIndex.toFixed(2)}`;
};

export const buildGraphFingerprint = (graph: SimulationGraph): string => graph.metadata.routeDigest;
