import { withBrand } from '@shared/core';
import type { CommandGraph, CommandSynthesisResult, CommandSynthesisRecord } from '@domain/recovery-command-orchestration';

export interface CommandGraphTelemetry {
  readonly graphId: string;
  readonly tenant: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly metrics: {
    readonly forecastMinutes: number;
    readonly conflictCount: number;
    readonly readinessScore: number;
    readonly riskBucket: 'low' | 'medium' | 'high';
    readonly eventCount: number;
  };
  readonly sample: CommandSynthesisResult;
}

export interface CommandGraphSeriesPoint {
  readonly tick: number;
  readonly timestamp: string;
  readonly readinessScore: number;
  readonly forecastMinutes: number;
  readonly blockedNodes: number;
  readonly resolvedNodes: number;
}

const riskBucket = (readinessScore: number): 'low' | 'medium' | 'high' => {
  if (readinessScore >= 70) return 'low';
  if (readinessScore >= 45) return 'medium';
  return 'high';
};

export const buildTelemetry = (graph: CommandGraph, result: CommandSynthesisResult): CommandGraphTelemetry => {
  const blocked = graph.nodes.filter((node) => node.state === 'blocked' || node.state === 'deferred').length;
  const resolved = graph.nodes.filter((node) => node.state === 'resolved').length;
  const readiness = result.ready ? result.readinessScore : Math.max(1, result.readinessScore - 10);

  return {
    graphId: graph.id,
    tenant: graph.tenant,
    runId: graph.runId,
    generatedAt: new Date().toISOString(),
    metrics: {
      forecastMinutes: result.forecastMinutes,
      conflictCount: result.conflicts.length,
      readinessScore: readiness,
      riskBucket: riskBucket(readiness),
      eventCount: blocked + resolved + graph.edges.length,
    },
    sample: result,
  };
};

export const foldTelemetry = (records: readonly CommandGraphTelemetry[]): readonly CommandGraphSeriesPoint[] =>
  records
    .map((entry, index) => {
      const blocked = entry.metrics.eventCount % 10;
      const resolved = entry.metrics.conflictCount + 2;
      return {
        tick: index + 1,
        timestamp: entry.generatedAt,
        readinessScore: entry.metrics.readinessScore,
        forecastMinutes: entry.metrics.forecastMinutes,
        blockedNodes: blocked,
        resolvedNodes: resolved,
      };
    })
    .toSorted((left, right) => left.tick - right.tick);

export const computeTrend = (points: readonly CommandGraphSeriesPoint[]): { readonly slope: number; readonly direction: 'up' | 'down' | 'flat' } => {
  if (points.length < 2) {
    return {
      slope: 0,
      direction: 'flat',
    };
  }
  const first = points[0];
  const last = points[points.length - 1];
  const slope = (last.readinessScore - first.readinessScore) / Math.max(1, points.length);
  return {
    slope,
    direction: slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat',
  };
};

export const recordToTelemetry = (graph: CommandGraph, record: CommandSynthesisRecord): CommandGraphTelemetry => {
  return buildTelemetry(graph, record.outcome);
};

export const buildSignalFromTelemetry = (record: CommandGraphTelemetry) => ({
  id: withBrand(`${record.graphId}:signal:${record.generatedAt}`, 'CommandGraphEnvelopeId'),
  tenant: record.tenant,
  runId: record.runId,
  generatedAt: record.generatedAt,
  score: record.metrics.readinessScore,
  bucket: record.metrics.riskBucket,
  conflicts: record.metrics.conflictCount,
  source: 'recovery-command-graph-store',
});
