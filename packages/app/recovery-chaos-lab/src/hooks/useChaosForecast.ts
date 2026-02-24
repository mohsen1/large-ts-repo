import { useMemo } from 'react';
import {
  asNamespace,
  asScenarioId,
  buildForecastCurve,
  buildRuntimeFromForecast,
  type StageBoundary
} from '@domain/recovery-chaos-lab';

export interface ForecastPoint {
  readonly point: string;
  readonly value: number;
  readonly confidence: number;
}

export interface ForecastSeries {
  readonly points: readonly ForecastPoint[];
  readonly max: number;
  readonly min: number;
}

export interface UseChaosForecastInput {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly stages: readonly StageBoundary<string, unknown, unknown>[];
}

export interface UseChaosForecastState {
  readonly runtime: ReturnType<typeof buildRuntimeFromForecast>;
  readonly longRange: ForecastSeries;
  readonly shortRange: ForecastSeries;
  readonly hasSignals: boolean;
}

const emptySeries: ForecastSeries = {
  points: [],
  max: 0,
  min: 0
};

function toSeries(points: readonly { readonly point: string; readonly value: number; readonly confidence: number }[]): ForecastSeries {
  if (!points.length) return emptySeries;
  const values = points.map((point) => point.value);
  return {
    points: points.map((point) => ({
      point: point.point,
      value: point.value,
      confidence: point.confidence
    })),
    max: Math.max(...values),
    min: Math.min(...values)
  };
}

function buildSignals(values: readonly ForecastPoint[]): boolean {
  return values.some((value) => value.value > 0.65 && value.confidence > 0.6);
}

export function useChaosForecast(input: UseChaosForecastInput): UseChaosForecastState {
  return useMemo(() => {
    const namespace = asNamespace(input.namespace);
    const scenarioId = asScenarioId(input.scenarioId);
    const stages = input.stages;

    const longRangeModel = buildForecastCurve({
      namespace,
      scenarioId,
      planTag: `${input.namespace}-${input.scenarioVersion}-long`,
      horizon: 'long',
      confidence: 0.83,
      window: '30m'
    });

    const shortRangeModel = buildForecastCurve({
      namespace,
      scenarioId,
      planTag: `${input.namespace}-${input.scenarioVersion}-short`,
      horizon: 'short',
      confidence: 0.68,
      window: '5m'
    });

    const runtime = buildRuntimeFromForecast(
      {
        namespace,
        scenarioId,
        planTag: `${input.namespace}-${input.scenarioVersion}`,
        horizon: 'short',
        confidence: 0.76,
        window: '1m'
      },
      stages
    );

    const longRange = toSeries(longRangeModel.traces.flatMap((trace) => trace.points));
    const shortRange = toSeries(shortRangeModel.traces.flatMap((trace) => trace.points));
    const hasSignals = buildSignals([...longRange.points, ...shortRange.points]);

    return {
      runtime,
      longRange,
      shortRange,
      hasSignals
    };
  }, [input.namespace, input.scenarioId, input.scenarioVersion, input.stages]);
}

export function collectForecastPoints<T extends { value: number; point: string; confidence: number }>(
  points: readonly T[]
): readonly ForecastPoint[] {
  return points.map((point) => ({
    point: `${point.point}`,
    value: Number(point.value),
    confidence: Number(point.confidence)
  }));
}
