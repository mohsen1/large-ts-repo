import { Brand, DeepReadonly, Merge, NonEmptyArray, UnionToIntersection } from '@shared/type-level';

export type ScenarioDesignTraceId = Brand<string, 'ScenarioDesignTraceId'>;
export type ScenarioDesignRunId = Brand<string, 'ScenarioDesignRunId'>;
export type ScenarioDesignEpoch = Brand<bigint, 'ScenarioDesignEpoch'>;

export type StageKindToken<T extends string> = `${T}:v${number}` & Brand<string, 'StageKindToken'>;
export type StageStatus =
  | 'idle'
  | 'queued'
  | 'warming'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped';

export type StageVerb = 'ingress' | 'enrichment' | 'forecast' | 'mitigation' | 'verification' | 'rollback' | 'audit';
export type StageVerbMap = Record<StageVerb, StageKindToken<StageVerb>>;

export type DeepBrand<T, B extends string> = Brand<T, B>;

export type NoInfer<T> = [T][T extends never ? never : 0];
export type EmptyTuple = readonly [];
export type Tail<T extends readonly unknown[]> = T extends readonly [any, ...infer Rest] ? Rest : readonly [];

export type Prepend<T extends unknown, U extends readonly unknown[]> = readonly [T, ...U];
export type Concat<T extends readonly unknown[], U extends readonly unknown[]> =
  T extends readonly [infer H, ...infer TRest]
    ? readonly [H, ...Concat<Extract<Tail<T>, readonly unknown[]>, U>]
    : U;

export type NormalizeTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...NormalizeTuple<Extract<Tail, readonly unknown[]>>]
  : EmptyTuple;

export type MapTuple<T extends readonly unknown[], F> = {
  [K in keyof T]: T[K] extends unknown ? F : never;
};

export type MergeTuples<A extends readonly unknown[], B extends readonly unknown[]> = {
  [K in keyof A as K extends keyof B ? never : K]: A[K];
} & {
  [K in keyof B]: B[K];
};

export type MergeRecords<T extends readonly Record<string, unknown>[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends Record<string, unknown>
      ? Tail extends readonly Record<string, unknown>[]
        ? Merge<Head, MergeRecords<Tail>>
        : Head
      : { [k: string]: never }
    : { [k: string]: never };

export type KeyRemap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `scenario_${K}` : never]: T[K];
};

export type StageConfigSchema<TKind extends StageVerb = StageVerb> =
  TKind extends 'ingress'
    ? { endpoint: string; timeoutMs: number }
  : TKind extends 'enrichment'
      ? { sources: readonly string[]; threshold: number }
    : TKind extends 'forecast'
      ? { horizonMs: number; confidence: number }
    : TKind extends 'mitigation'
      ? { playbookIds: readonly string[]; maxRetries: number }
    : TKind extends 'verification'
      ? { checks: readonly string[] }
            : TKind extends 'rollback'
              ? { rollbackId: string; hardCutover: boolean }
              : { auditOnly: boolean };

export interface StageVector<TKind extends StageVerb, TInput, TOutput> {
  readonly kind: TKind;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface RawRecord<T extends string, V> {
  readonly id: DeepBrand<T, 'record-id'>;
  readonly values: readonly V[];
}

export type StageVectorByKind<T extends readonly StageVector<StageVerb, unknown, unknown>[], K extends StageVerb> =
  Extract<T[number], { kind: K }>;

export interface StageMarker<T extends string = string> {
  readonly id: Brand<T, 'StageMarker'>;
  readonly token: StageKindToken<T>;
  readonly createdAt: ScenarioDesignEpoch;
}

export type StageEdge<TA extends string, TB extends string> = {
  readonly from: Brand<TA, 'StageEdgeFrom'>;
  readonly to: Brand<TB, 'StageEdgeTo'>;
  readonly condition?: `when.${string}`;
};

export interface StageTopologySnapshot {
  readonly graphId: Brand<string, 'TopologyGraph'>;
  readonly nodeCount: number;
  readonly edges: readonly StageEdge<string, string>[];
}

export interface StagePlan<TKind extends StageVerb, TInput, TOutput> {
  readonly kind: TKind;
  readonly id: Brand<string, `stage-${TKind}`>;
  readonly dependencies: readonly Brand<string, string>[];
  readonly config: StageConfigSchema<TKind>;
  readonly execute: (input: TInput, context: ScenarioContext) => Promise<TOutput>;
}

export interface ScenarioContext {
  readonly runId: ScenarioDesignRunId;
  readonly traceId: ScenarioDesignTraceId;
  readonly startedAt: number;
  readonly parentTrace?: ScenarioDesignTraceId;
}

export interface StagePayload<TContext, TInput, TOutput> {
  readonly stageId: Brand<string, 'StagePayloadId'>;
  readonly status: StageStatus;
  readonly context: TContext;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly emittedAt: number;
}

export interface StageCheckpoint {
  readonly at: number;
  readonly marker: StageMarker;
  readonly detail: string;
}

export interface ScenarioRunEnvelope<TInput, TOutput> {
  readonly runId: ScenarioDesignRunId;
  readonly traceId: ScenarioDesignTraceId;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly checkpoints: readonly StageCheckpoint[];
}

export type InferInput<T> = T extends StagePlan<StageVerb, infer I, unknown> ? I : never;
export type InferOutput<T> = T extends StagePlan<StageVerb, unknown, infer O> ? O : never;

export type StageChain<T extends readonly StagePlan<StageVerb, unknown, unknown>[]> = {
  readonly stages: NormalizeTuple<T>;
  readonly order: readonly [
    ...T extends readonly StagePlan<StageVerb, unknown, unknown>[]
      ? { [K in keyof T]: T[K]['kind'] }
      : never[],
  ];
};

export function toRecord<T extends Record<string, unknown>>(input: T): Readonly<T> {
  return input;
}

export function freezeRecord<T extends Record<string, unknown>>(input: T): DeepReadonly<T> {
  return Object.freeze(input) as DeepReadonly<T>;
}

export type EventEnvelope<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: `1.${number}.${number}`;
  readonly payload: TPayload;
  readonly timestamp: number;
};

export type MergeEventUnion<T extends readonly EventEnvelope<string, unknown>[]> = UnionToIntersection<
  T[number] extends infer E
    ? E extends EventEnvelope<infer Name, infer Payload>
      ? { [K in Name]: Payload }
      : never
    : never
>;

export type MetricSuffix<K extends string> = `metric:${K}`;
export type MetricRecord<K extends string> = {
  [P in MetricSuffix<K>]: {
    readonly value: number;
    readonly confidence: number;
  };
};

export type BrandedMetricName<TKind extends string> = Brand<`${TKind}_p95`, 'ScenarioMetric'>;

export const designDefaults = {
  maxRetries: 3,
  cooldownMs: 250,
  checkpointWindowMs: 5_000,
  stages: ['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit'] as const,
} as const satisfies {
  maxRetries: number;
  cooldownMs: number;
  checkpointWindowMs: number;
  stages: readonly StageVerb[];
};

export type DesignDefaultsStages = (typeof designDefaults)['stages'][number];
