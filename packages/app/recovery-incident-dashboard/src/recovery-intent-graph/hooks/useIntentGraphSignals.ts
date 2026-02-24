import { useMemo, useState } from 'react';
import type { IntentTelemetry, IntentOutput } from '@domain/recovery-intent-graph';

type SignalPoint = {
  readonly signal: string;
  readonly timestamp: number;
  readonly intensity: number;
};

export interface IntentGraphSignalState {
  readonly totalSignals: number;
  readonly strongestSignal: SignalPoint | undefined;
  readonly trend: 'up' | 'stable' | 'down';
  readonly timeline: readonly SignalPoint[];
}

const normalize = (value: number, max: number): number => (max === 0 ? 0 : value / max);

const inferTrend = (values: readonly number[]): 'up' | 'stable' | 'down' => {
  if (values.length < 2) return 'stable';
  const delta = values.at(-1)! - values.at(0)!;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'stable';
};

export const useIntentGraphSignals = (telemetry: readonly IntentTelemetry[], outputs: readonly IntentOutput[]): IntentGraphSignalState => {
  const timeline = useMemo<SignalPoint[]>(() => {
    const max = telemetry.reduce((acc, item) => Math.max(acc, item.elapsedMs), 0);
    return telemetry.map((item, index) => ({
      signal: `${item.graphId}:${index}:${item.nodeId}`,
      timestamp: item.elapsedMs,
      intensity: normalize(item.elapsedMs, max),
    }));
  }, [telemetry]);

  const strongest = timeline.at(-1);
  const totalSignals = timeline.length;
  const trend = inferTrend(timeline.map((point) => point.intensity));
  const withOutputs = useMemo(() => {
    const unique = new Set(outputs.flatMap((output) => output.recommendations));
    return {
      recommendationCount: unique.size,
      recommendationSignal: [...unique].slice(0, 3),
    };
  }, [outputs]);

  return {
    totalSignals,
    strongestSignal: strongest,
    trend,
    timeline: timeline.map((point) => ({
      ...point,
      signal: `${point.signal}:${withOutputs.recommendationCount}`,
    })),
  };
};
