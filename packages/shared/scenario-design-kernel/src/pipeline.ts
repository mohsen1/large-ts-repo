import type {
  StagePlan,
  StageVerb,
  StagePayload,
  ScenarioContext,
  StageCheckpoint,
  ScenarioDesignEpoch,
} from './types';
import type { StageKindToken } from './types';

export type StageChainTemplate<T extends readonly StagePlan<StageVerb, any, any>[]> = T;
export type InputForTemplate<T> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends StagePlan<StageVerb, infer Input, any>
    ? Rest extends readonly []
      ? Input
      : InputForTemplate<Extract<Rest, readonly StagePlan<StageVerb, any, any>[]>>
    : never
  : never;

export type OutputForTemplate<T> = T extends readonly [...any[], infer Last]
  ? Last extends StagePlan<StageVerb, any, infer Output>
    ? Output
    : never
  : never;

export type PipeTuple<
  TInput,
  T extends readonly StagePlan<StageVerb, any, any>[],
> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends StagePlan<StageVerb, infer HIn, infer HOut>
    ? readonly [
        (input: TInput) => Promise<unknown>,
        ...PipeTuple<HOut, Extract<Rest, readonly StagePlan<StageVerb, any, any>[]>>,
      ]
    : readonly []
  : readonly [];

export type StageChainResult<T extends readonly StagePlan<StageVerb, unknown, unknown>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends StagePlan<StageVerb, any, infer TOut>
      ? Rest extends readonly StagePlan<StageVerb, any, any>[]
        ? [First, ...StageChainResult<Rest>]
        : [First]
      : []
    : [];

export interface PipelineFrame<TInput, TOutput> {
  readonly stage: string;
  readonly kind: StageVerb;
  readonly startedAt: number;
  readonly status: 'ok' | 'skip' | 'error';
  readonly payload: StagePayload<unknown, TInput, TOutput>;
}

export interface PipelineReport<TInput, TOutput, TContext = unknown> {
  readonly status: 'done' | 'partial' | 'stopped';
  readonly frames: readonly PipelineFrame<TInput, TOutput>[];
  readonly elapsedMs: number;
}

export async function composeChain<TTemplate extends StageChainTemplate<StageTemplateInference>>(template: TTemplate) {
  type Input = InputForTemplate<TTemplate>;
  type Output = OutputForTemplate<TTemplate>;
  type Cursor = unknown;
  return async (input: Input, context: ScenarioContext): Promise<{ output: Output; report: PipelineReport<Input, Output> }> => {
    const started = performance.now();
    const frames: PipelineFrame<Input, Output>[] = [];

    let cursor: Cursor = input as Cursor;
    let idx = 0;
    const chain = template as readonly StagePlan<StageVerb, any, any>[];

    for (const stage of chain) {
      const localStart = performance.now();
      const maybeOutput = await (
        stage.execute as (input: unknown, context: ScenarioContext) => Promise<unknown>
      )(cursor, context);
      const elapsed = performance.now() - localStart;

      const frame: PipelineFrame<Input, Output> = {
      stage: String(stage.id),
      kind: stage.kind,
      startedAt: localStart,
      status: maybeOutput === undefined ? 'skip' : 'ok',
      payload: {
        stageId: stage.id as unknown as StagePayload<ScenarioContext, Input, Output>['stageId'],
        status: elapsed > 120 ? 'active' : 'completed',
        context,
        input: cursor as Input,
        output: maybeOutput as unknown as Output,
        emittedAt: Date.now(),
      },
    };

      frames.push(frame);
      cursor = maybeOutput ?? cursor;
      idx += 1;
      if (!maybeOutput && idx < chain.length && stage.kind === 'audit') {
        return {
          output: cursor as Output,
          report: {
            status: 'partial',
            frames,
            elapsedMs: performance.now() - started,
          },
        };
      }
    }

    return {
      output: cursor as Output,
      report: {
        status: 'done',
        frames,
        elapsedMs: performance.now() - started,
      },
    };
  };
}

export function checkpointsFromReport<TInput, TOutput>(report: PipelineReport<TInput, TOutput>): readonly StageCheckpoint[] {
  return report.frames.map((frame, index) => ({
    at: frame.startedAt,
      marker: {
        id: `checkpoint-${index}` as StageCheckpoint['marker']['id'],
        token: `checkpoint:v1` as StageKindToken<string>,
        createdAt: BigInt(Math.floor(frame.startedAt)) as ScenarioDesignEpoch,
      },
      detail: `${frame.stage}:${frame.status}`,
    }));
}

type StageTemplateInference = readonly StagePlan<StageVerb, any, any>[];

export function* planIterator<TTemplate extends StageTemplateInference>(template: TTemplate): Generator<TTemplate[number]> {
  for (const stage of template) {
    yield stage;
  }
}

export function normalizePipeline<TTemplate extends StageTemplateInference>(template: TTemplate): TTemplate {
  return [...template].sort((left, right) => left.kind.localeCompare(right.kind)) as unknown as TTemplate;
}

export function pipelineDebug<TTemplate extends StageTemplateInference>(template: TTemplate): readonly string[] {
  return [...planIterator(template)].map((stage) => `${stage.kind}(${stage.id})`);
}

export const pipelineHelpers = {
  composeChain,
  normalizePipeline,
  pipelineDebug,
  planIterator,
} as const;
