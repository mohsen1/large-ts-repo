import {
  type Brand,
  type EntityId,
  type IsoTimestamp,
  StageMetadata,
  StageResult,
  TemporalEnvelope,
  asStageId,
  isoNow,
} from './types';
import { TemporalPluginRegistry, type PluginName, type TemporalPluginContext } from './plugin-registry';

export interface FlowNode<TInput, TOutput, TContext = TemporalPluginContext> {
  readonly id: Brand<string, 'FlowNode'>;
  readonly stage: StageMetadata;
  run(input: TInput, context: TContext): Promise<TOutput>;
}

export type FlowTuple<TInput, TOutput> =
  TInput extends void
    ? []
    : [FlowNode<TInput, TOutput>];

export interface TemporalStep<TInput, TOutput> {
  readonly node: string;
  readonly inputType: string;
  readonly outputType: string;
  execute(input: TInput): Promise<TOutput>;
}

export interface TemporalFlow<TInput, TOutput> {
  readonly inputType: string;
  readonly outputType: string;
  readonly stages: readonly StageMetadata[];
  run(input: TInput, context: TemporalPluginContext): Promise<TOutput>;
}

export type InferredInput<TStage> = TStage extends FlowNode<infer TInput, any> ? TInput : never;
export type InferredOutput<TStage> = TStage extends FlowNode<any, infer TOutput> ? TOutput : never;
export type PipeInput<TSteps extends readonly unknown[]> = TSteps extends readonly [
  infer THead,
  ...infer _TRest,
]
  ? InferredInput<THead>
  : never;
export type PipeOutput<TSteps extends readonly unknown[]> = TSteps extends readonly [
  ...infer _TRest,
  infer TLast,
]
  ? InferredOutput<TLast>
  : never;

export type StageTrace<TInput, TOutput> = {
  input: TInput;
  output: TOutput;
  consumedAt: IsoTimestamp;
  plugin: string;
};

export type StepResultTuple<TNode extends readonly FlowNode<any, any>[]> = {
  [TIndex in keyof TNode]: TNode[TIndex] extends FlowNode<infer TInput, infer TOutput>
    ? StageTrace<TInput, TOutput>
    : never;
};

const createFlowId = (scope: string): Brand<string, 'RunId'> => `${scope}:${Math.random().toString(36).slice(2)}` as Brand<string, 'RunId'>;

export class TemporalFlowBuilder {
  readonly #steps: TemporalStep<unknown, unknown>[] = [];
  readonly #id: Brand<string, 'RunId'>;

  constructor(id: string) {
    this.#id = createFlowId(id);
  }

  add<TInput, TOutput>(node: FlowNode<TInput, TOutput>): this {
    const step: TemporalStep<TInput, TOutput> = {
      node: node.id,
      inputType: String(typeof node.id),
      outputType: String(typeof node.id),
      execute: async (input: TInput) => {
        return node.run(input, {
          runId: `${this.#id}:context` as Brand<string, 'RunId'>,
          tenant: 'global' as Brand<string, 'TenantId'>,
          at: isoNow(),
        });
      },
    };

    this.#steps.push(step);
    return this;
  }

  build(): TemporalFlow<unknown, unknown>;
  build<TSteps extends readonly FlowNode<unknown, unknown>[]>(
    ..._steps: TSteps
  ): TemporalFlow<PipeInput<TSteps>, PipeOutput<TSteps>>;
  build<TSteps extends readonly FlowNode<unknown, unknown>[]>(
    ..._steps: TSteps
  ): TemporalFlow<PipeInput<TSteps>, PipeOutput<TSteps>> {
    const steps = [...this.#steps];
    const flowId = this.#id;
    const staged = steps
      .map((step, index) => ({
        id: asStageId(flowId, `stage:${index}`),
        description: `stage ${index}`,
        tags: new Set([step.node]),
        sequence: index,
      } satisfies StageMetadata));

    return {
      inputType: 'object',
      outputType: 'object',
      stages: staged,
      async run<TInput, TOutput>(input: TInput, context: TemporalPluginContext): Promise<TOutput> {
        let cursor: unknown = input;
        const trace: StageTrace<unknown, unknown>[] = [];

        for (const step of steps) {
          const next = await step.execute(cursor);
          trace.push({
            input: cursor,
            output: next,
            consumedAt: isoNow(),
            plugin: step.node,
          });
          cursor = next;
        }

        void trace;
        return cursor as TOutput;
      },
    };
  }
}

import type { RunId } from './types';

export type TimelineRecord<TStage, TValue> = {
  readonly stage: TStage;
  readonly value: TValue;
  readonly recordedAt: IsoTimestamp;
  readonly runId: RunId;
};

type TimelineTraceRecord<TStage extends string, TInput, TOutput> = TimelineRecord<
  TStage,
  {
    readonly input: TInput;
    readonly output: TOutput;
  }
>;
type TimelineTraceMap<TStage extends string, TInput, TOutput> = Map<
  TStage,
  TimelineTraceRecord<TStage, TInput, TOutput>[]
>;

export const makeTraceRecord = <TStage extends string, TInput, TOutput>(
  stage: TStage,
  runId: Brand<string, 'RunId'>,
  input: TInput,
  output: TOutput,
): TimelineTraceRecord<TStage, TInput, TOutput> => ({
  stage,
  value: { input, output },
  recordedAt: isoNow(),
  runId,
});

export const foldTimeline = <TStage extends string, TInput, TOutput>(
  stage: TStage,
  runId: Brand<string, 'RunId'>,
  steps: Iterable<TimelineTraceRecord<TStage, TInput, TOutput>>,
): ReadonlyMap<
  TStage,
  TimelineTraceRecord<TStage, TInput, TOutput>[]
> => {
  const bucket: TimelineTraceMap<TStage, TInput, TOutput> = new Map();
  for (const item of steps) {
    const list = bucket.get(item.stage) ?? [];
    list.push(item);
    bucket.set(item.stage, list);
  }

  const out: TimelineTraceMap<TStage, TInput, TOutput> = new Map();
  for (const [key, values] of bucket) {
    out.set(
      key,
      values.toSorted((left, right) => Number(right.recordedAt.localeCompare(left.recordedAt))),
    );
  }

  return out;
};

export const summarizeTrace = <TInput, TOutput>(
  records: readonly TimelineTraceRecord<string, TInput, TOutput>[],
): readonly TemporalEnvelope<string, TimelineTraceRecord<string, TInput, TOutput>>[] => {
  const runId = records[0]?.runId ?? ('run:undefined' as Brand<string, 'RunId'>);
  return records
    .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .map((record) => ({
      kind: 'temporal:trace' as const,
      correlationId: `${runId}:trace` as Brand<string, 'CorrelationId'>,
      at: isoNow(),
      payload: record,
    }));
};

export const runPipelineWithRegistry = async <
  TPlugins extends Record<string, any>,
  TNames extends readonly PluginName<TPlugins>[],
  TInput,
>(
  registry: TemporalPluginRegistry<TPlugins>,
  sequence: TNames,
  input: TInput,
  context: TemporalPluginContext,
): Promise<{
  readonly traces: readonly StageTrace<unknown, unknown>[];
  readonly values: readonly unknown[];
}> => {
  let cursor: unknown = input;
  const traces: StageTrace<unknown, unknown>[] = [];
  for (const pluginName of sequence) {
    const output = await registry.run(pluginName as PluginName<TPlugins>, cursor as never, context);
    const outputAsUnknown = output as unknown;
    traces.push({
      input: cursor,
      output: outputAsUnknown,
      consumedAt: isoNow(),
      plugin: pluginName,
    });
    cursor = outputAsUnknown;
  }

  return {
    traces: traces.toSorted((left, right) => left.consumedAt.localeCompare(right.consumedAt)),
    values: traces.map((trace) => trace.output),
  };
};
