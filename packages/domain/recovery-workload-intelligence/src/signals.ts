import type { WorkloadNode, WorkloadSnapshot, WorkloadUnitId } from './types';

export type MetricSignalKind = 'cpu' | 'iops' | 'error-rate' | 'throughput' | 'lag';

export interface MetricSignal {
  readonly nodeId: WorkloadUnitId;
  readonly kind: MetricSignalKind;
  readonly value: number;
  readonly unit: string;
  readonly at: string;
  readonly tags: readonly string[];
}

export interface MetricWindow {
  readonly kind: MetricSignalKind;
  readonly unit: string;
  readonly firstSampleAt: string;
  readonly lastSampleAt: string;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p95: number;
  readonly trend: 'improving' | 'stable' | 'degrading';
}

export interface NodeSignalProfile {
  readonly nodeId: WorkloadNode['id'];
  readonly windows: readonly MetricWindow[];
  readonly signalDensity: number;
  readonly dominantSignal: MetricSignalKind;
}

const toSampleList = (samples: readonly WorkloadSnapshot[], kind: MetricSignalKind): number[] => {
  return samples.map((sample) => {
    if (kind === 'cpu') {
      return sample.cpuUtilization;
    }
    if (kind === 'iops') {
      return sample.iopsUtilization;
    }
    if (kind === 'error-rate') {
      return sample.errorRate;
    }
    if (kind === 'throughput') {
      return sample.throughput;
    }
    return sample.cpuUtilization - sample.errorRate;
  });
};

const p95 = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const copy = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.floor((copy.length - 1) * 0.95));
  return copy[index] ?? 0;
};

const trendFromSeries = (values: readonly number[]): MetricWindow['trend'] => {
  if (values.length < 2) {
    return 'stable';
  }
  const half = Math.max(1, Math.floor(values.length / 2));
  const first = values.slice(0, half);
  const second = values.slice(-half);
  const firstAvg = first.reduce((acc, sample) => acc + sample, 0) / first.length;
  const secondAvg = second.reduce((acc, sample) => acc + sample, 0) / second.length;
  if (secondAvg < firstAvg * 0.98) {
    return 'improving';
  }
  if (secondAvg > firstAvg * 1.03) {
    return 'degrading';
  }
  return 'stable';
};

export const summarizeSignals = (
  node: WorkloadNode,
  snapshots: readonly WorkloadSnapshot[],
): NodeSignalProfile => {
  const kinds: readonly MetricSignalKind[] = ['cpu', 'iops', 'error-rate', 'throughput', 'lag'];
  const windows = kinds.map((kind) => {
    const values = toSampleList(snapshots, kind);
    const safeValues = values.filter((value) => Number.isFinite(value));
    if (safeValues.length === 0) {
      return {
        kind,
        unit: 'n/a',
        firstSampleAt: snapshots[0]?.timestamp ?? new Date().toISOString(),
        lastSampleAt: snapshots.at(-1)?.timestamp ?? new Date().toISOString(),
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
        trend: 'stable' as const,
      };
    }
    const min = Math.min(...safeValues);
    const max = Math.max(...safeValues);
    const avg = safeValues.reduce((acc, sample) => acc + sample, 0) / safeValues.length;
    return {
      kind,
      unit: kind === 'throughput' ? 'rps' : 'percent',
      firstSampleAt: snapshots[0]?.timestamp ?? new Date().toISOString(),
      lastSampleAt: snapshots.at(-1)?.timestamp ?? new Date().toISOString(),
      min,
      max,
      avg,
      p95: p95(safeValues),
      trend: trendFromSeries(safeValues),
    };
  });

  const ranked = [...windows].sort((left, right) => right.avg - left.avg);
  const dominant = ranked[0]?.kind ?? 'cpu';
  return {
    nodeId: node.id,
    windows,
    signalDensity: windows.filter((window) => window.max > 0).length,
    dominantSignal: dominant,
  };
};

export const buildSignals = (
  node: WorkloadNode,
  snapshots: readonly WorkloadSnapshot[],
): readonly MetricSignal[] => {
  return snapshots.flatMap((snapshot) => {
    const sampleTime = snapshot.timestamp;
    const base: Array<[MetricSignalKind, number, string]> = [
      ['cpu', snapshot.cpuUtilization, 'percent'],
      ['iops', snapshot.iopsUtilization, 'percent'],
      ['error-rate', snapshot.errorRate, 'percent'],
      ['throughput', snapshot.throughput, 'rps'],
      ['lag', Math.max(0, snapshot.cpuUtilization - snapshot.throughput / 100), 'ratio'],
    ];
    return base.map(([kind, value, unit]) => ({
      nodeId: snapshot.nodeId,
      kind,
      value,
      unit,
      at: sampleTime,
      tags: [node.team, node.region, node.id],
    }));
  });
};
