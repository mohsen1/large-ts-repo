import { tupleJoin } from '@shared/typed-orchestration-core/tuple-utils';
import { asBrand } from '@shared/typed-orchestration-core/brands';
import { PluginLifecycle } from '@shared/typed-orchestration-core/registry';
import type { EventEnvelope, EventChannel, EventKind } from '@shared/typed-orchestration-core/runtime-events';

export type FlowToken = `flow:${string}`;
export type FlowStepState = 'queued' | 'active' | 'done' | 'failed';

export interface FlowStep<TInput, TOutput> {
  readonly id: FlowToken;
  readonly label: string;
  readonly priority: number;
  readonly run: PluginLifecycle<TInput, TOutput>;
}

export interface FlowSummary<TInput, TOutput> {
  readonly stepCount: number;
  readonly state: FlowStepState;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly route: TInput;
  readonly result: TOutput;
}

export type StepResult<TOutput> = {
  readonly id: FlowToken;
  readonly state: FlowStepState;
  readonly output: TOutput;
  readonly durationMs: number;
};

export class FlowBuilder<TInput, TOutput> {
  readonly #steps: Array<FlowStep<TInput, TOutput>> = [];

  public add(id: FlowToken, label: string, run: PluginLifecycle<TInput, TOutput>): this {
    this.#steps.push({
      id,
      label,
      priority: this.#steps.length + 1,
      run,
    });
    return this;
  }

  public route(): readonly FlowStep<TInput, TOutput>[] {
    return this.#steps.toSorted((left, right) => left.priority - right.priority);
  }
}

export const routeToSignal = <TInput, TOutput>(steps: readonly FlowStep<TInput, TOutput>[]): string => {
  const labels = steps.map((step) => step.label);
  return tupleJoin(labels, ' -> ');
};

export interface FlowRunnerOptions {
  readonly throttleMs?: number;
}

export const collectFlowOutputs = async <TInput, TOutput>(
  steps: readonly FlowStep<TInput, TOutput>[],
  input: TInput,
  options: FlowRunnerOptions = {},
): Promise<StepResult<TOutput>[]> => {
  const started = new Date().toISOString();
  void started;
  const outputs: StepResult<TOutput>[] = [];
  let current = input as unknown as TOutput;

  for (const step of steps) {
    const startedAt = performance.now();
    const outcome = await step.run(input, {
      id: asBrand(`stage:${step.id}:${Date.now()}`, 'StageEventId'),
      namespace: 'namespace:flow',
      startedAt: new Date().toISOString(),
      correlation: {
        runId: asBrand(`run:${Date.now()}`, 'RunId'),
        tenant: asBrand('tenant:flow', 'TenantId'),
      },
      input,
    });

    if (outcome.status === 'success' && outcome.output !== null) {
      current = outcome.output;
    }

    outputs.push({
      id: step.id,
      state:
        outcome.status === 'success'
          ? 'done'
          : outcome.status === 'error'
            ? 'failed'
            : outcome.status === 'cancelled'
              ? 'queued'
              : 'queued',
      output: current,
      durationMs: performance.now() - startedAt,
    });

    if (options.throttleMs && options.throttleMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.throttleMs));
    }
  }

  return outputs;
};

export const collectFromIterator = async <TInput>(
  source: Iterable<TInput> | AsyncIterable<TInput>,
): Promise<TInput[]> => {
  const sink: TInput[] = [];
  if (Symbol.asyncIterator in Object(source)) {
    for await (const entry of source as AsyncIterable<TInput>) {
      sink.push(entry);
    }
    return sink;
  }
  for (const entry of source as Iterable<TInput>) {
    sink.push(entry);
  }
  return sink;
};

export const consumeEvents = async function* <TEvent>(events: Iterable<TEvent>): AsyncGenerator<TEvent> {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
};

export const mapEvents = function* <TInput, TOutput>(
  events: Iterable<TInput>,
  mapper: (input: TInput) => TOutput,
): IterableIterator<TOutput> {
  for (const event of events) {
    yield mapper(event);
  }
};

export const summarizeEvents = <TEvent extends EventEnvelope<string, string, string>>(
  events: readonly TEvent[],
): ReadonlyArray<{ readonly route: string; readonly count: number }> =>
  events.reduce((acc, event) => {
    const key = event.event as EventChannel | EventKind | `${string}/${string}`;
    const existing = acc.find((entry) => entry.route === key);
    if (existing) {
      existing.count += 1;
      return acc;
    }
    acc.push({ route: key, count: 1 });
    return acc;
  }, [] as { route: string; count: number }[]);
