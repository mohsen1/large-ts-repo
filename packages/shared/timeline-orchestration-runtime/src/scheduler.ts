import { iter } from './iterator-helpers';
import { type Brand } from '@shared/type-level';
import { type RuntimeTrace } from './plugin-registry';

export type TimelineStepKind = 'ingest' | 'plan' | 'simulate' | 'validate' | 'report';

export interface TimelineStepResult<TPayload> {
  readonly kind: TimelineStepKind;
  readonly payload: TPayload;
  readonly startedAt: Date;
  readonly elapsedMs: number;
}

export interface TimelineStep<TInput, TOutput> {
  readonly kind: TimelineStepKind;
  readonly name: string;
  readonly transform: (input: TInput, trace: RuntimeTrace) => Promise<TOutput>;
}

type LastOf<TTuple extends readonly unknown[]> = TTuple extends readonly [ ...unknown[], infer Last ] ? Last : never;

export type AppendStep<
  TTuple extends readonly TimelineStep<any, any>[],
  TStep extends TimelineStep<any, any>,
> = readonly [...TTuple, TStep];

export type InferStepInput<TStep extends TimelineStep<any, any>> =
  TStep extends TimelineStep<infer TInput, any> ? TInput : never;

export type InferStepOutput<TStep extends TimelineStep<any, any>> =
  TStep extends TimelineStep<any, infer TOutput> ? TOutput : never;

export type PipelineInput<
  TSteps extends readonly TimelineStep<any, any>[],
> = TSteps extends readonly [infer Head, ...unknown[]]
  ? Head extends TimelineStep<infer TInput, any>
    ? TInput
    : never
  : never;

export type PipelineOutput<TSteps extends readonly TimelineStep<any, any>[]> =
  TSteps extends readonly [...unknown[], infer Last]
    ? Last extends TimelineStep<any, infer TOutput>
      ? TOutput
      : never
    : never;

export interface TimelineScheduleTrace {
  readonly runId: string;
  readonly totalMs: number;
  readonly steps: number;
}

export class TimelineScheduler {
  readonly #namespace: string;
  #steps: Array<TimelineStep<any, any>>;

  constructor(namespace: string) {
    this.#namespace = namespace;
    this.#steps = [];
  }

  append<TInput, TOutput>(step: TimelineStep<TInput, TOutput>): void {
    this.#steps = [...this.#steps, step];
  }

  appendMany<TSteps extends readonly TimelineStep<any, any>[]>(steps: TSteps): void {
    this.#steps = [...this.#steps, ...steps];
  }

  steps(): readonly TimelineStep<any, any>[] {
    return [...this.#steps];
  }

  async run<TInput, TOutput>(input: TInput): Promise<TimelineScheduleTrace & { result: TOutput }> {
    const traceBase: RuntimeTrace = {
      namespace: this.#namespace,
      invocationId: `${this.#namespace}:scheduler:${Date.now()}` as Brand<string, 'timeline-invocation-id'>,
      invokedAt: Date.now(),
      source: 'scheduler',
    };

    const start = Date.now();
    let cursor: unknown = input;

    const results: TimelineStepResult<unknown>[] = [];
    for (const step of this.#steps) {
      const stepStart = Date.now();
      cursor = await step.transform(cursor, traceBase);
      results.push({
        kind: step.kind,
        payload: cursor,
        startedAt: new Date(stepStart),
        elapsedMs: Date.now() - stepStart,
      });
    }

    const flattened = iter(results)
      .map((entry) => `${entry.kind}:${entry.elapsedMs}`)
      .toArray();

    void flattened;

    const totalMs = results.reduce((seed, entry) => seed + entry.elapsedMs, 0);
    return {
      runId: traceBase.invocationId,
      totalMs,
      steps: this.#steps.length,
      result: cursor as TOutput,
    };
  }

  async runBatched<TInput, TOutput>(
    input: TInput,
    batchSize = 2,
  ): Promise<Array<TimelineScheduleTrace & { result: TOutput }>> {
    const sequence = [...this.#steps];
    const grouped = iter(sequence)
      .chunks(Math.max(1, batchSize))
      .map((chunk) => chunk.map((step) => step.name))
      .collect();

    const traces: Array<TimelineScheduleTrace & { result: TOutput }> = [];
    for (const group of grouped) {
      for (const name of group) {
        const step = sequence.find((entry) => entry.name === name);
        if (!step) {
          continue;
        }
        const stepRun = await this.run<TInput, TOutput>(input);
        traces.push(stepRun);
      }
    }

    return traces;
  }
}

export function createScheduler(namespace: string): TimelineScheduler {
  return new TimelineScheduler(namespace);
}

export type { RuntimeTrace } from './plugin-registry';
