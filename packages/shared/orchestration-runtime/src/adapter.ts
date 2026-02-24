import type { Brand } from '@shared/typed-orchestration-core/brands';
import { NoInfer } from '@shared/typed-orchestration-core/tuple-utils';

export interface AdapterInput<TPayload> {
  readonly payload: TPayload;
  readonly timestamp: string;
}

export interface AdapterOutput<TPayload> {
  readonly accepted: boolean;
  readonly payload: TPayload;
  readonly message: string;
}

export type AdapterId = Brand<string, 'AdapterId'>;
export type AdapterTransport = 'http' | 'sqs' | 'eventbridge' | 'kinesis';

export interface AdapterMetrics {
  readonly sent: number;
  readonly failed: number;
  readonly latencyMs: number;
}

export interface RuntimeAdapterService<TInput = unknown, TOutput = unknown> {
  readonly id: AdapterId;
  readonly name: string;
  readonly transport: AdapterTransport;
  readonly active: boolean;
  readonly send: (input: NoInfer<TInput>) => Promise<AdapterOutput<TOutput>>;
}

export type AdapterStack<TInput, TOutput> = readonly RuntimeAdapterService<TInput, TOutput>[];

export interface AdapterStep<TInput, TOutput> {
  readonly id: AdapterId;
  readonly label: string;
  readonly run: (input: NoInfer<TInput>) => Promise<AdapterOutput<TOutput>>;
}

export type AdapterTimeline = readonly [start: string, ...string[]];

export const toAdapterTimeline = <TStages extends readonly string[]>(
  stages: TStages,
): TStages extends readonly [string, ...string[]] ? TStages : ['start', ...TStages] => {
  const timeline = ['start', ...stages] as string[];
  return timeline.slice(1) as TStages extends readonly [string, ...string[]] ? TStages : ['start', ...TStages];
};

export const composeAdapters = async <TInput, TOutput>(
  adapters: readonly AdapterStep<TInput, TOutput>[],
  input: TInput,
): Promise<AdapterOutput<TOutput>> => {
  let current = input as unknown as TOutput;
  for (const step of adapters) {
    const output = await step.run(current as unknown as TInput);
    if (!output.accepted) {
      return {
        accepted: false,
        payload: current,
        message: `adapter ${step.id} rejected payload`,
      };
    }
    current = output.payload;
  }
  return {
    accepted: true,
    payload: current,
    message: 'all adapters accepted',
  };
};

export const foldAdapterTimings = (adapters: readonly { latencyMs: number }[]) =>
  adapters.reduce((acc, step) => {
    acc.push(step.latencyMs);
    return acc;
  }, [] as number[]);
