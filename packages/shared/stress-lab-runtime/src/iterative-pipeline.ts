import {
  collectAsyncIterable,
  chunkIterable,
  collectIterable,
  filterIterable,
  mapIterable,
} from './iterator-utils';

export interface PipelineStep<TIn, TOut> {
  readonly label: string;
  readonly weight: number;
  readonly execute: (input: TIn) => Promise<TOut> | TOut;
}

export interface PipelineContext {
  readonly tenantId: string;
  readonly runId: string;
  readonly startedAt: number;
}

export interface PipelineRecord<TValue = unknown> {
  readonly step: string;
  readonly input: TValue;
  readonly output: TValue;
  readonly elapsedMs: number;
  readonly timestamp: number;
}

export interface PipelineTelemetry<TValue = unknown> {
  readonly context: PipelineContext;
  readonly records: readonly PipelineRecord<TValue>[];
  readonly totalMs: number;
}

export type ChainInput<T> = Iterable<T> | AsyncIterable<T>;
export type Predicate<T> = (value: T, index: number) => boolean;
export type Transformer<T, R> = (value: T, index: number) => R;

type PipelineHeadInput<TChain extends readonly PipelineStep<any, any>[]> = TChain extends readonly [
  infer TFirst,
  ...unknown[],
]
  ? TFirst extends PipelineStep<infer TInput, unknown>
    ? TInput
    : never
  : never;

type PipelineTailOutput<TChain extends readonly PipelineStep<any, any>[]> = TChain extends readonly [
  ...unknown[],
  infer TLast,
]
  ? TLast extends PipelineStep<unknown, infer TOutput>
    ? TOutput
    : never
  : never;

export const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
  value !== null && value !== undefined && (typeof value === 'object' || typeof value === 'function') && 'then' in value;

export const normalizeStepWeight = (step: Pick<PipelineStep<unknown, unknown>, 'weight'>): number =>
  Number.isFinite(step.weight) && step.weight > 0 ? step.weight : 0;

export const collectFilteredPipeline = <T>(input: Iterable<T>, predicate: Predicate<T>): readonly T[] =>
  collectIterable(filterIterable(input, predicate));

export const mapPipelineOutput = <T, TMap>(input: Iterable<T>, mapper: Transformer<T, TMap>): readonly TMap[] =>
  collectIterable(mapIterable(input, mapper));

export const zipPipelines = <A extends readonly unknown[], B extends readonly unknown[]>(
  left: A,
  right: B,
): readonly (readonly [A[number], B[number]])[] =>
  collectIterable(
    mapIterable(
      left,
      (entry, index) => [entry, right[index] as B[number]] as [A[number], B[number]],
    ),
  );

export const createPipelineRecord = <T>(
  step: PipelineStep<T, unknown>,
  input: T,
  output: unknown,
  startedAt: number,
): PipelineRecord<T> => ({
  step: step.label,
  input,
  output: output as T,
  elapsedMs: Date.now() - startedAt,
  timestamp: Date.now(),
});

export const runPipeline = async <
  TChain extends readonly PipelineStep<any, any>[],
  TSeed extends PipelineHeadInput<TChain>,
>(
  chain: TChain,
  seedInput: TSeed,
  context: PipelineContext,
): Promise<{
  readonly output: PipelineTailOutput<TChain>;
  readonly telemetry: PipelineTelemetry<unknown>;
}> => {
  const startAt = Date.now();
  const records: PipelineRecord[] = [];
  let current: unknown = seedInput;

  const ordered = [...chain].toSorted((left, right) => normalizeStepWeight(left) - normalizeStepWeight(right));
  for (const step of ordered) {
    const started = Date.now();
    const output = step.execute(current as never);
    const resolved = isPromiseLike(output) ? await output : output;
    records.push(createPipelineRecord(step, current, resolved, started));
    current = resolved;
  }

  return {
    output: current as PipelineTailOutput<TChain>,
    telemetry: {
      context,
      records: records as readonly PipelineRecord<unknown>[],
      totalMs: Date.now() - startAt,
    },
  };
};

export const streamPipeline = async <TChain extends readonly PipelineStep<unknown, unknown>[], TSeed>(
  pipeline: TChain,
  seed: TSeed,
  context: PipelineContext,
): Promise<{
  output: PipelineTailOutput<TChain>;
  telemetry: PipelineTelemetry<unknown>;
}> => {
  return runPipeline(pipeline, seed as PipelineHeadInput<TChain>, context);
};

export const collectTelemetryChunks = <T>(input: Iterable<T>, chunkSize: number): readonly T[][] =>
  collectIterable(
    mapIterable(chunkIterable(input, Math.max(1, chunkSize)), (entry) => [...entry]),
  );

export const reduceAsync = async <T, S>(
  input: AsyncIterable<T>,
  seed: S,
  reducer: (state: S, value: T, index: number) => Promise<S>,
): Promise<S> => {
  const values = await collectAsyncIterable(input);
  let state = seed;
  for (const [index, value] of values.entries()) {
    state = await reducer(state, value, index);
  }
  return state;
};
