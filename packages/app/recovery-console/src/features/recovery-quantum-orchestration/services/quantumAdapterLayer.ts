import { chain } from '@shared/orchestration-kernel';
import type { TelemetryFrame } from '@shared/orchestration-kernel';
import type { QuantumPluginMetric, QuantumTelemetryPoint, QuantumWorkspace, QuantumExecutionResult } from '../types';

export type QuantumMetricMode = 'raw' | 'smoothed' | 'compressed';

export interface TelemetryEnvelope {
  readonly id: string;
  readonly at: string;
  readonly label: string;
  readonly value: number;
}

export interface AdapterEventRow {
  readonly index: number;
  readonly event: string;
  readonly score: number;
}

export interface QuantumMetricSeries {
  readonly mode: QuantumMetricMode;
  readonly points: readonly QuantumTelemetryPoint[];
}

const bucketMetric = (metric: QuantumTelemetryPoint, index: number): AdapterEventRow => ({
  index,
  event: metric.key,
  score: metric.value / Math.max(1, index + 1),
});

export interface QuantumAdapterFacadeOptions {
  readonly trim?: number;
  readonly mode?: QuantumMetricMode;
  readonly suppressWarnings?: boolean;
}

export const transformTelemetryFrames = (
  frames: readonly (TelemetryFrame | QuantumTelemetryPoint)[],
): readonly QuantumTelemetryPoint[] =>
  frames.map((frame, index) => {
    if ('payload' in frame) {
      return {
        at: 'at' in frame ? frame.at : new Date().toISOString(),
        key: `payload:${String(frame.id)}`,
        value: Object.keys(frame.payload).length + index,
        tags: [String(frame.kind)],
      };
    }
    return frame;
  });

export const splitSeries = (series: readonly QuantumTelemetryPoint[]): readonly QuantumMetricSeries[] => {
  const grouped = new Map<string, QuantumTelemetryPoint[]>();
  for (const point of series) {
    const bucket = grouped.get(point.key) ?? [];
    bucket.push(point);
    grouped.set(point.key, bucket);
  }

  return [
    {
      mode: 'raw',
      points: series,
    },
    {
      mode: 'smoothed',
      points: [...grouped.entries()].flatMap(([key, points]) =>
        points.map((point, index) => ({
          ...point,
          key: `${key}:smooth:${index}`,
          value: Math.round((points.slice(0, index + 1).reduce((acc, next) => acc + next.value, 0) / (index + 1)) * 100) / 100,
        })),
      ),
    },
    {
      mode: 'compressed',
      points: chain(series).take(Math.floor(series.length / 2)).toArray(),
    },
  ];
};

const normalizeMetric = (value: number, mode: QuantumMetricMode): number => {
  if (mode === 'smoothed') {
    return Number((value / 1.12).toFixed(3));
  }
  if (mode === 'compressed') {
    return Number((value / 1.34).toFixed(3));
  }
  return value;
};

export const adaptTelemetryToRows = (
  mode: QuantumMetricMode,
  points: readonly QuantumTelemetryPoint[],
  options?: QuantumAdapterFacadeOptions,
): readonly AdapterEventRow[] => {
  const trim = options?.trim ?? points.length;
  const raw = splitSeries(points).find((series) => series.mode === mode) ?? {
    mode: 'raw' as const,
    points,
  };
  return raw.points
    .slice(0, trim)
    .map((point, index) => bucketMetric({ ...point, value: normalizeMetric(point.value, mode) }, index));
};

export const renderMetricPulse = (rows: readonly AdapterEventRow[]): string =>
  rows
    .map((row) => `#${row.index}:${row.event}=${row.score.toFixed(3)}`)
    .join(' | ');

export interface QuantumAdapterSummary {
  readonly workspaceId: string;
  readonly timestamp: string;
  readonly modes: readonly QuantumMetricMode[];
  readonly rowsByMode: Record<QuantumMetricMode, readonly AdapterEventRow[]>;
}

export const summarizeAdapter = (
  workspace: QuantumWorkspace,
  result: QuantumExecutionResult,
  metrics: readonly QuantumTelemetryPoint[],
  pluginMetrics: readonly QuantumPluginMetric[],
  options?: QuantumAdapterFacadeOptions,
): QuantumAdapterSummary => {
  const safeMode = options?.mode ?? 'raw';
  const rows = adaptTelemetryToRows(
    safeMode,
    metrics,
    options,
  );
  const modes: QuantumMetricMode[] = ['raw', 'smoothed', 'compressed'];

  const rowsByMode = {
    raw: adaptTelemetryToRows('raw', metrics, { ...options, mode: 'raw' }),
    smoothed: adaptTelemetryToRows('smoothed', metrics, { ...options, mode: 'smoothed' }),
    compressed: adaptTelemetryToRows('compressed', metrics, { ...options, mode: 'compressed' }),
  };

  void result;
  return {
    workspaceId: workspace.workspaceId,
    timestamp: new Date().toISOString(),
    modes,
    rowsByMode,
  };
};
