import { asNamespace, asScenarioId, type ChaosMetricWindow, type ChaosStatus, type StageBoundary } from './types';
import { buildChaosPlan, type StepName, type SliceSequence, type TimelineBucket } from './plan';

export type NoInfer<T> = [T][T extends infer U ? 0 : never];

export type ForecastHorizon = 'now' | 'short' | 'medium' | 'long';
export type ForecastWindow = `${ForecastHorizon}:${ChaosMetricWindow}`;
export type BucketWeight = `${'warm' | 'cold' | 'hot'}-${number}`;
export type ForecastAxis<TValue extends string = string> = `${TValue}::axis`;

export interface ForecastInput<TName extends string = string> {
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly scenarioId: ReturnType<typeof asScenarioId>;
  readonly planTag: TName;
  readonly horizon: ForecastHorizon;
  readonly confidence: number;
  readonly window: ChaosMetricWindow;
}

export interface ForecastPoint<TName extends string = string> {
  readonly point: `${TName}:${number}`;
  readonly value: number;
  readonly confidence: number;
  readonly variance: number;
}

export interface ForecastTrace<T extends string = string> {
  readonly axis: ForecastAxis<T>;
  readonly points: readonly ForecastPoint<T>[];
  readonly bucket: BucketWeight;
}

export interface ForecastModel<TName extends string = string> {
  readonly name: `${TName}-model`;
  readonly status: ChaosStatus;
  readonly traces: readonly ForecastTrace<TName>[];
}

export type TraceAccumulator<T extends readonly string[]> = {
  [K in T[number]]: ForecastTrace<K>;
};

export type StageForecastState<TName extends string> = {
  readonly stage: StepName<TName>;
  readonly pressure: number;
  readonly risk: 'low' | 'medium' | 'high';
};

export type StageForecastTuple<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [I in keyof T]: T[I] extends StageBoundary<infer Name, infer _, infer _Output>
    ? readonly [Name, StageForecastState<Name>]
    : never;
};

export interface ForecastRuntime {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly updatedAt: number;
  readonly stages: readonly string[];
  readonly statusByStage: Readonly<Record<string, ChaosStatus>>;
  readonly pointsByStage: Readonly<Record<string, readonly number[]>>;
}

const statusTransitionTable = {
  idle: ['arming', 'complete'],
  arming: ['active', 'failed'],
  active: ['verified', 'failed'],
  verified: ['healing', 'complete'],
  healing: ['complete', 'failed'],
  complete: ['complete'],
  failed: ['failed']
} as const satisfies Record<ChaosStatus, readonly ChaosStatus[]>;

function toRisk(score: number): 'low' | 'medium' | 'high' {
  if (score < 0.33) return 'low';
  if (score < 0.66) return 'medium';
  return 'high';
}

function parseHorizon(value: ForecastHorizon): number {
  return value === 'now' ? 0 : value === 'short' ? 1 : value === 'medium' ? 6 : 24;
}

function toBucketWeight(index: number, max: number): BucketWeight {
  const ratio = index / Math.max(max, 1);
  return ratio < 0.33 ? `cold-${index}` : ratio < 0.66 ? `warm-${index}` : `hot-${index}`;
}

export function buildForecastCurve<TName extends string>(input: ForecastInput<TName>): ForecastModel<TName> {
  const bucketCount = parseHorizon(input.horizon);
  const points: ForecastPoint<TName>[] = Array.from({ length: bucketCount + 1 }, (_value, index) => {
    const amplitude = Math.sin(index / Math.max(bucketCount, 1) + input.confidence);
    const value = Number((0.5 + amplitude * 0.5).toFixed(4));
    const variance = Number((Math.abs(amplitude) * input.confidence).toFixed(4));
    return {
      point: `${input.planTag}:${index}`,
      value,
      confidence: input.confidence,
      variance
    };
  });

  const windowBucket = toBucketWeight(bucketCount, bucketCount + 1);
  return {
    name: `${input.planTag}-model` as const,
    status: input.confidence > 0.66 ? 'verified' : input.confidence > 0.33 ? 'active' : 'arming',
    traces: [
      {
        axis: `${input.planTag}::axis` as const,
        points,
        bucket: windowBucket
      }
  ]
  };
}

export function forecastByScenario<T extends readonly StageBoundary<string, unknown, unknown>[]>(planTag: string, stages: T): {
  model: ForecastModel;
  traceCount: number;
} {
  const buckets: TimelineBucket[] = ['pre-s', 'mid-m', 'post-h'];
  const plan = buildChaosPlan(
    {
      namespace: asNamespace('platform-chaos'),
      scenarioId: asScenarioId('00000000-0000-0000-0000-000000000001'),
      stages,
      tags: ['control:active', ...([] as const)]
    },
    '30m',
    stages.map((stage) => Number(stage.weight ?? 1))
  );

  const sliceSequence = plan.slices as SliceSequence<T>;
  const traces = sliceSequence.map((slice, index) => {
    const axis = `${slice.stageName}::axis` as const;
    const bucket = buckets[index % buckets.length];
    const points = Array.from({ length: Math.max(3, bucket.length) }, (_value, i) => {
      const value = ((index + 1) * (i + 1)) / Math.max(stages.length, 1);
      return {
        point: `${slice.stageName}:${index}:${i}`,
        value,
        confidence: 0.3 + (index / Math.max(stages.length, 1)),
        variance: Number((Math.abs(Math.sin(i)) * 0.2).toFixed(4))
      } as ForecastPoint;
    });
    return {
      axis,
      points,
      bucket: `${bucket === 'pre-s' ? 'cold' : bucket === 'mid-m' ? 'warm' : 'hot'}-${index}` as BucketWeight
    };
  });

  return {
    model: {
      name: `${planTag}-model` as const,
      status: 'idle',
      traces
    },
    traceCount: traces.length
  };
}

export function stageForecastSequence<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T
): StageForecastTuple<T> {
  const entries = stages.map((stage, index) => {
    const pressure = ((index + 1) / Math.max(stages.length, 1)) ** 2;
    return [
      stage.name as T[number]['name'],
      {
        stage: stage.name as StepName<T[number]['name'] & string>,
        pressure,
        risk: toRisk(pressure)
      }
    ] as const;
  });
  return entries as unknown as StageForecastTuple<T>;
}

export function buildRuntimeFromForecast<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  input: ForecastInput<string>,
  stages: T
): ForecastRuntime {
  const model = buildForecastCurve(input);
  const pointsByStage = Object.fromEntries(
    stages.map((stage, index) => [
      stage.name,
      model.traces[index % model.traces.length]?.points.map((trace) => trace.value) ?? []
    ])
  );
  const statusByStage = Object.fromEntries(
    stages.map((stage, index) => [stage.name, index % 2 === 0 ? 'verified' : 'active'])
  );
  return {
    namespace: input.namespace,
    scenarioId: input.scenarioId,
    updatedAt: Date.now(),
    stages: stages.map((stage) => stage.name),
    statusByStage: statusByStage as Record<string, ChaosStatus>,
    pointsByStage: pointsByStage as Record<string, readonly number[]>
  };
}
