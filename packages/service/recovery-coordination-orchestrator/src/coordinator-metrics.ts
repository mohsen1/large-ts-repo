import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  CoordinationProgram,
} from '@domain/recovery-coordination';
import { buildMetrics, buildWorkflowGraph } from '@domain/recovery-coordination';
import type { CoordinationAttemptReport } from './types';

export interface MetricSnapshot {
  readonly runId: string;
  readonly tenant: string;
  readonly capturedAt: string;
  readonly topologyNodes: number;
  readonly candidateCompletionMinutes: number;
  readonly selectedDecision: CoordinationAttemptReport['selection']['decision'];
  readonly throughput: number;
  readonly utilization: number;
}

export interface SnapshotWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface CoordinationTrend {
  readonly runIds: readonly string[];
  readonly averageThroughput: number;
  readonly healthScore: number;
  readonly utilization: number;
}

export interface MetricsRegistryOptions {
  readonly windowSizeMinutes: number;
}

export class RecoveryCoordinationMetricCollector {
  private snapshots: MetricSnapshot[] = [];

  constructor(private readonly options: MetricsRegistryOptions = { windowSizeMinutes: 60 }) {}

  ingest(program: CoordinationProgram, report: CoordinationAttemptReport): Result<MetricSnapshot, Error> {
    if (!program.id || !report.runId) {
      return fail(new Error('invalid-metric-input'));
    }

    const graph = buildWorkflowGraph(program);
    const metrics = buildMetrics(program.tenant, report.runId, program, report.selection);

    const snapshot: MetricSnapshot = {
      runId: report.runId,
      tenant: report.tenant,
      capturedAt: new Date().toISOString(),
      topologyNodes: graph.nodes.length,
      candidateCompletionMinutes: metrics.candidateCompletion,
      selectedDecision: report.selection.decision,
      throughput: graph.nodes.length > 0 ? graph.nodes.length / Math.max(1, program.steps.length) : 0,
      utilization: metrics.candidateParallelism,
    };

    this.snapshots.push(snapshot);
    return ok(snapshot);
  }

  trend(window: SnapshotWindow): CoordinationTrend {
    const samples = this.snapshots.filter((snapshot) => {
      const from = Date.parse(window.from);
      const to = Date.parse(window.to);
      const sampleAt = Date.parse(snapshot.capturedAt);
      const within = Number.isNaN(sampleAt)
        ? true
        : (Number.isNaN(from) || sampleAt >= from) && (Number.isNaN(to) || sampleAt <= to);
      return within;
    });

    const throughputSamples = samples.map((snapshot) => snapshot.throughput);
    const utilizationSamples = samples.map((snapshot) => snapshot.utilization);

    const averageThroughput = throughputSamples.length
      ? throughputSamples.reduce((sum, value) => sum + value, 0) / throughputSamples.length
      : 0;
    const averageUtilization = utilizationSamples.length
      ? utilizationSamples.reduce((sum, value) => sum + value, 0) / utilizationSamples.length
      : 0;

    return {
      runIds: samples.map((snapshot) => snapshot.runId),
      averageThroughput,
      healthScore: averageThroughput * averageUtilization,
      utilization: averageUtilization,
    };
  }
}

export const createDefaultMetricsCollector = (): RecoveryCoordinationMetricCollector =>
  new RecoveryCoordinationMetricCollector({ windowSizeMinutes: 90 });
