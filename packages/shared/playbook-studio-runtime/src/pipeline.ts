import { mapWithIteratorHelpers } from '@shared/type-level';
import type { StageResult } from './contract';
import type { NoInfer } from '@shared/type-level';

export type PipelineStage<TInput, TOutput> = (input: NoInfer<TInput>) => StageResult<TInput, TOutput>;

export type PipelineInput<TPipeline extends readonly PipelineStage<any, any>[]> = TPipeline extends readonly [
  infer First,
  ...infer Rest,
]
  ? First extends PipelineStage<infer TInput, any>
    ? Rest extends readonly PipelineStage<any, any>[]
      ? TInput & PipelineInput<Rest>
      : TInput
    : never
  : never;

type PipelineOutputRec<TPipeline extends readonly PipelineStage<any, any>[]> = TPipeline extends readonly [
  infer Current,
  ...infer Rest,
]
  ? Current extends PipelineStage<infer TInput, infer TOutput>
    ? Rest extends readonly PipelineStage<TOutput, any>[]
      ? PipelineOutputRec<Rest>
      : StageResult<TInput, TOutput>
    : never
  : never;

export type PipelineOutput<TPipeline extends readonly PipelineStage<any, any>[]> =
  TPipeline extends readonly [] ? never : PipelineOutputRec<TPipeline>;

export interface PipelineSeed<TPipeline extends readonly PipelineStage<any, any>[]> {
  readonly label: string;
  readonly stages: NoInfer<TPipeline>;
}

export interface PipelineSnapshot<TInput, TOutput> {
  readonly stageCount: number;
  readonly input: TInput;
  readonly output: TOutput;
}

export class Pipeline<TStages extends readonly PipelineStage<any, any>[]> {
  readonly #stages: ReadonlyArray<PipelineStage<any, any>>;
  readonly #label: string;

  constructor(seed: PipelineSeed<TStages>) {
    this.#stages = [...seed.stages];
    this.#label = seed.label;
  }

  async run<TInput>(input: TInput): Promise<PipelineOutput<TStages>> {
    let current: unknown = input;
    for (const stage of this.#stages) {
      current = await stage(current);
    }
    return current as PipelineOutput<TStages>;
  }

  async snapshot<TInput, TOutput>(input: PipelineInput<TStages> & TInput): Promise<PipelineSnapshot<TInput, TOutput>> {
    const output = (await this.run(input)) as TOutput;
    return {
      stageCount: this.#stages.length,
      input,
      output,
    };
  }

  names(): readonly string[] {
    return mapWithIteratorHelpers(
      this.#stages.map((stage, index) => [index, String(stage.name || `stage-${index}`)] as const),
      ([, name]) => name,
    );
  }

  get label(): string {
    return this.#label;
  }

  withMap<TNewOutput>(mapper: (value: PipelineOutput<TStages>) => TNewOutput): Pipeline<
    [
      ...TStages,
      PipelineStage<PipelineOutput<TStages>, TNewOutput>,
    ]
  > {
    const stages = [
      ...this.#stages,
      async (seed: PipelineOutput<TStages>) => mapper(seed),
    ] as [
      ...TStages,
      PipelineStage<PipelineOutput<TStages>, TNewOutput>,
    ];

    return new Pipeline<[
      ...TStages,
      PipelineStage<PipelineOutput<TStages>, TNewOutput>,
    ]>({ label: `${this.#label}.map`, stages });
  }
}

export const createPipeline = <TStages extends readonly PipelineStage<any, any>[]>
  (label: string, ...stages: TStages): Pipeline<TStages> => {
  return new Pipeline<TStages>({ label, stages });
};

export const runAsStages = async <
  TInput,
  TOutput,
  const TStages extends readonly PipelineStage<TInput, any>[],
>(
  seed: PipelineSeed<TStages>,
  input: TInput,
): Promise<PipelineOutput<TStages>> => {
  const pipeline = createPipeline(seed.label, ...seed.stages);
  return pipeline.run(input);
};

export const composeStages = <A, B, C>(
  stageA: PipelineStage<A, B>,
  stageB: PipelineStage<B, C>,
): Pipeline<[PipelineStage<A, B>, PipelineStage<B, C>]> =>
  createPipeline('composeStages', stageA, stageB);
