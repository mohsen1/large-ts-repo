import { buildRuntimeManifest, runOrchestratedConvergence, type RuntimeOutput } from './convergence-runtime';
import {
  buildNode,
  buildEdge,
  inferGraphFromEdges,
  mapTopologyEdges,
  topologyDigest,
  toEdgeWeight,
  type RuntimeTopologyEdge,
  type RuntimeTopologyNode,
  type RuntimeGraph,
  type TopologyAccumulator,
} from './convergence-graph';
import type { ConvergenceScope } from '@domain/recovery-lab-orchestration-core';

export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';

export interface RuntimeTraceEvent {
  readonly at: string;
  readonly kind: 'stage' | 'metric' | 'error';
  readonly scope: ConvergenceScope;
  readonly message: string;
  readonly severity: SeverityBand;
}

export interface RuntimeTimeline {
  readonly runId: string;
  readonly events: readonly RuntimeTraceEvent[];
  readonly graph: RuntimeGraph;
}

export interface ScopedTimeline {
  readonly scope: ConvergenceScope;
  readonly timelines: readonly RuntimeTimeline[];
}

export interface TelemetryWindow {
  readonly start: string;
  readonly end: string;
  readonly durationMs: number;
  readonly eventCount: number;
}

const severityForScore = (value: number): SeverityBand => {
  if (value >= 0.82) return 'low';
  if (value >= 0.55) return 'medium';
  if (value >= 0.3) return 'high';
  return 'critical';
};

const buildTraceEvent = (scope: ConvergenceScope, message: string, score: number, kind: RuntimeTraceEvent['kind']): RuntimeTraceEvent => ({
  at: new Date().toISOString(),
  kind,
  scope,
  message,
  severity: severityForScore(score),
});

const mergeTimelines = (left: readonly RuntimeTimeline[], right: readonly RuntimeTimeline[]): readonly RuntimeTimeline[] => {
  const byRunId = new Map<string, RuntimeTimeline>();

  for (const timeline of [...left, ...right]) {
    const existing = byRunId.get(timeline.runId);
    if (!existing) {
      byRunId.set(timeline.runId, timeline);
      continue;
    }

    byRunId.set(timeline.runId, {
      ...existing,
      events: [...existing.events, ...timeline.events].toSorted((a, b) => b.at.localeCompare(a.at)),
    });
  }

  return [...byRunId.values()];
};

export const collectScopeTimeline = async (tenantId: string, scope: ConvergenceScope): Promise<RuntimeTimeline> => {
  const manifest = await buildRuntimeManifest(tenantId);
  const run = await runOrchestratedConvergence(tenantId, scope, [`${scope}:seed`, `${scope}:signal`]);
  const graph = inferGraphFromEdges(run.output.runId, scope, [run.output]);

  const events: RuntimeTraceEvent[] = [
    buildTraceEvent(scope, `manifest:${manifest.stage}`, manifest.pluginCount, 'metric'),
    buildTraceEvent(
      scope,
      `plugins:${manifest.pluginCount}`,
      manifest.pluginCount / Math.max(1, manifest.planCount),
      'stage',
    ),
  ];

  const timeline = {
    runId: run.runId,
    events,
    graph,
  } satisfies RuntimeTimeline;

  return timeline;
};

export const runConvergenceDiagnostics = async (
  tenantId: string,
  scopes: readonly ConvergenceScope[] = ['tenant', 'topology', 'signal', 'policy', 'fleet'],
): Promise<ScopedTimeline> => {
  const timelines = await Promise.all(scopes.map((scope) => collectScopeTimeline(tenantId, scope)));

  const merged = mergeTimelines(timelines, []);
  return {
    scope: scopes[0] ?? 'tenant',
    timelines: merged,
  };
};

export const scoreConvergenceTimeline = (timeline: RuntimeTimeline): number => {
  const scored = timeline.events.toSorted((left, right) =>
    left.severity.localeCompare(right.severity) || right.at.localeCompare(left.at),
  );
  const weights = scored.map((entry, index) => {
    const base = entry.kind === 'error' ? 0.1 : entry.kind === 'metric' ? 0.3 : 0.6;
    return base / Math.max(1, index + 1);
  });

  return weights.reduce((acc, value) => acc + value, 0);
};

export const timelineWindow = (timeline: RuntimeTimeline): TelemetryWindow => {
  const events = timeline.events.toSorted((left, right) => left.at.localeCompare(right.at));
  const start = events.at(0)?.at ?? new Date().toISOString();
  const end = events.at(-1)?.at ?? start;
  return {
    start,
    end,
    durationMs: new Date(end).getTime() - new Date(start).getTime(),
    eventCount: events.length,
  };
};

export const rerankGraphEdges = (graph: RuntimeGraph, score: number): readonly RuntimeTopologyEdge[] =>
  mapTopologyEdges(graph, (weight, reason) => toEdgeWeight(weight * score + reason.length / 100));

export const inspectTopologyDigest = (graph: RuntimeGraph): string => topologyDigest(graph);

const startRunRecord = (): TopologyAccumulator => {
  return {
    nodes: [],
    edges: [],
    score: 0,
  };
};

const seedNode = (scope: ConvergenceScope) =>
  buildNode('seed' as any, scope, 'input', 0);

const seedEdge = (from: RuntimeTopologyNode, to: RuntimeTopologyNode): RuntimeTopologyEdge => {
  return buildEdge(from.id, to.id, 'seed:edge', 0.4);
};

export const bootstrapTimeline = (scope: ConvergenceScope): RuntimeTimeline => {
  const first = seedNode(scope);
  const next = buildNode('seed' as any, scope, 'resolve', 1);
  const edge = seedEdge(first, next);

  const accumulator = startRunRecord();
  const graph: RuntimeGraph = {
    runId: 'seed' as any,
    nodes: [
      first,
      next,
      ...accumulator.nodes,
    ],
    edges: [
      edge,
      ...accumulator.edges,
    ],
    metadata: {
      scope,
      confidence: accumulator.score + 0.5,
      score: accumulator.score + 0.5,
    },
  };

  return {
    runId: graph.runId,
    events: [
      buildTraceEvent(scope, 'bootstrap', 1, 'metric'),
      buildTraceEvent(scope, `edges:${graph.edges.length}`, 0.6, 'stage'),
    ],
    graph,
  };
};
