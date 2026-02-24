import type { LabCommand, LabMetricPoint, LabPlan, LabRunId, LabRunSummary, LabSignal, LabWave } from './models';
import { createRunEnvelope, createTopologySignature, isCriticalSignal } from './utils';

export interface LabTimelinePoint {
  readonly at: string;
  readonly signalCount: number;
  readonly commandCount: number;
  readonly severityMax: number;
}

export interface LabHealthSnapshot {
  readonly runId: LabRunId;
  readonly health: 'ok' | 'degraded' | 'critical';
  readonly trend: 'improving' | 'stable' | 'worsening';
  readonly windowSizeMs: number;
  readonly phaseCount: number;
}

export interface LabTelemetryBucket {
  readonly bucket: number;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly spikes: readonly number[];
}

export interface LabReport {
  readonly runId: LabRunId;
  readonly snapshot: LabHealthSnapshot;
  readonly timeline: readonly LabTimelinePoint[];
  readonly buckets: readonly LabTelemetryBucket[];
  readonly topologyDigest: string;
  readonly signalSignature: string;
}

export interface LabPlanDigest {
  readonly runId: LabRunId;
  readonly waveCount: number;
  readonly commandCount: number;
  readonly signalCount: number;
  readonly signature: string;
}

const bucketSignal = (value: number, maxBucket = 5): number => Math.floor(value / 20) % (maxBucket + 1);

export const summarizeSignals = (signals: readonly LabSignal[]): readonly LabTimelinePoint[] => {
  const grouped = new Map<string, { signals: number; commands: number; maxSeverity: number }>();
  for (const signal of signals) {
    const existing = grouped.get(signal.phase) ?? { signals: 0, commands: 0, maxSeverity: 0 };
    grouped.set(signal.phase, {
      signals: existing.signals + 1,
      commands: existing.commands,
      maxSeverity: Math.max(existing.maxSeverity, signal.severity),
    });
  }

  return [...grouped.entries()].map(([phase, value]) => ({
    at: `${phase}-${value.signals}`,
    signalCount: value.signals,
    commandCount: value.commands,
    severityMax: value.maxSeverity,
  }));
};

export const summarizeBuckets = (values: readonly number[], windowSize = 5): readonly LabTelemetryBucket[] => {
  const maxBuckets = 5;
  const buckets: LabTelemetryBucket[] = [];
  for (let bucket = 0; bucket <= maxBuckets; bucket += 1) {
    const valuesInBucket = values.filter((value) => bucketSignal(value) === bucket);
    if (valuesInBucket.length === 0) {
      buckets.push({
        bucket,
        avg: 0,
        min: 0,
        max: 0,
        spikes: [],
      });
      continue;
    }

    const total = valuesInBucket.reduce((sum, value) => sum + value, 0);
    const avg = total / valuesInBucket.length;
    const min = Math.min(...valuesInBucket);
    const max = Math.max(...valuesInBucket);
    const spikes = valuesInBucket.filter((value) => value > avg + windowSize).map((value) => Number(value.toFixed(2)));
    buckets.push({
      bucket,
      avg: Number(avg.toFixed(3)),
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      spikes,
    });
  }

  return Object.freeze(buckets);
};

export const evaluateRunSummary = (summary: LabRunSummary): LabHealthSnapshot => {
  const windowSizeMs = summary.metrics.medianSignalLatencyMs * 60;
  const worstWarning = summary.metrics.riskDelta > 0.5;
  return {
    runId: summary.runId,
    health:
      summary.metrics.riskDelta > 0.9
        ? 'critical'
        : summary.metrics.riskDelta > 0.5
          ? 'degraded'
          : 'ok',
    trend: worstWarning
      ? 'worsening'
      : summary.metrics.confidence > 0.8
        ? 'improving'
        : 'stable',
    windowSizeMs,
    phaseCount: summary.policy.length,
  };
};

export const buildReport = (
  runId: LabRunId,
  waves: readonly LabWave[],
  signals: readonly LabSignal[],
  commands: readonly LabCommand[],
  metrics: readonly LabMetricPoint[],
): LabReport => {
  const timeline = summarizeSignals(signals);
  const values = metrics.map((metric) => metric.value);
  const criticalSignals = signals.filter((signal) => signal.severity >= 4);
  const risk = criticalSignals.length;
  const summary: LabRunSummary = {
    runId,
    phase: 'observe',
    health: risk > 2 ? 'degraded' : 'running',
    warnings: [],
    metrics: {
      runId,
      totalSignals: signals.length,
      criticalSignals: signals.filter(isCriticalSignal).length,
      commandCount: commands.length,
      medianSignalLatencyMs: values.length === 0 ? 0 : values[Math.floor(values.length / 2)] ?? 0,
      riskDelta: risk * 0.1,
      confidence: values.length === 0 ? 0 : (values.filter((value) => value > 50).length / values.length),
      telemetry: metrics,
    },
    policy: [],
  };

  return {
    runId,
    snapshot: evaluateRunSummary(summary),
    timeline,
    buckets: summarizeBuckets(values),
    topologyDigest: createTopologySignature(waves.map((wave) => wave.id)),
    signalSignature: createRunEnvelope(signals.map((signal) => signal.id)),
  };
};

export const digestPlan = (plan: LabPlan<unknown, unknown>): LabPlanDigest => ({
  runId: plan.runId,
  waveCount: plan.waves.length,
  commandCount: plan.commands.length,
  signalCount: plan.signals.length,
  signature: plan.waves.reduce((acc, wave) => `${acc}:${wave.id}`, 'plan'),
});

export const renderReportText = (report: LabReport): string => {
  const lines = [
    `run=${report.runId}`,
    `snapshot=${report.snapshot.health}`,
    `trend=${report.snapshot.trend}`,
    `waves=${report.timeline.length}`,
    `topology=${report.topologyDigest}`,
    `signature=${report.signalSignature}`,
  ];
  return lines.join('\n');
};
