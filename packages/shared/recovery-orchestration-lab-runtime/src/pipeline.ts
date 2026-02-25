import { parseRunId, type RunId } from './ids.js';
import type { RuntimePlugin } from './registry.js';
import { collectAll, toAsyncIterator } from './iterable-helpers.js';

type AsyncDisposableLike = {
  [Symbol.asyncDispose](): PromiseLike<void>;
};

type StackCtor = new () => unknown;

const createAsyncDisposableStack = (): AsyncDisposableLike => {
  const Ctor = (globalThis as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack;
  if (!Ctor) {
    return {
      [Symbol.asyncDispose]: async () => undefined,
    };
  }

  const live = new Ctor();
  return {
    [Symbol.asyncDispose]: async () => {
      const disposeAsync = (live as { disposeAsync?: () => PromiseLike<void> }).disposeAsync;
      if (typeof disposeAsync === 'function') {
        await disposeAsync.call(live);
        return;
      }

      const asyncDispose = (live as { [Symbol.asyncDispose]?: () => PromiseLike<void> })?.[Symbol.asyncDispose];
      if (typeof asyncDispose === 'function') {
        await asyncDispose.call(live);
        return;
      }

      const dispose = (live as { dispose?: () => void }).dispose;
      if (typeof dispose === 'function') {
        dispose.call(live);
      }
    },
  };
};

export interface RuntimePipelineStep<TInput, TOutput> {
  readonly kind: 'transform' | 'filter' | 'checkpoint';
  readonly label: string;
  readonly run: (input: TInput) => Promise<TOutput>;
}

export interface RuntimePipelineError {
  readonly runId: RunId;
  readonly step: string;
  readonly reason: string;
}

export interface RuntimePipelineMetrics {
  readonly runId: RunId;
  readonly stepCount: number;
  readonly errorCount: number;
  readonly completed: boolean;
}

export type RuntimePipelineResult<TOutput> =
  | { ok: true; value: TOutput; metrics: RuntimePipelineMetrics }
  | { ok: false; error: RuntimePipelineError; metrics: RuntimePipelineMetrics };

export const createRunId = (tenant: string, run: string): RunId => parseRunId(`run:${tenant}:${run}`);

type StackDisposer = AsyncDisposableLike;

export class Pipeline<TInput, TOutput> {
  readonly #stack: StackDisposer = createAsyncDisposableStack();
  readonly #steps: Array<RuntimePipelineStep<unknown, unknown>>;
  readonly #runId: RunId;

  constructor(runId: RunId, steps: Array<RuntimePipelineStep<unknown, unknown>>) {
    this.#steps = steps;
    this.#runId = runId;
  }

  async execute(input: TInput): Promise<RuntimePipelineResult<TOutput>> {
    await using _scope = this.#stack;
    let current: unknown = input;
    let completed = 0;
    let errors = 0;

    for (const step of this.#steps) {
      try {
        const next = await step.run(current as never);
        completed += 1;
        current = next;
      } catch (error) {
        errors += 1;
        return {
          ok: false,
          error: {
            runId: this.#runId,
            step: step.label,
            reason: String((error as Error).message ?? error),
          },
          metrics: {
            runId: this.#runId,
            stepCount: this.#steps.length,
            errorCount: errors,
            completed: false,
          },
        };
      }
    }

    return {
      ok: true,
      value: current as TOutput,
      metrics: {
        runId: this.#runId,
        stepCount: this.#steps.length,
        errorCount: errors,
        completed: true,
      },
    };
  }

  async executeAll(inputs: Iterable<TInput>): Promise<RuntimePipelineResult<readonly TOutput[]>> {
    const output = await collectAll(
      this.stream(toAsyncIterator(inputs), this.#runId),
    );
    return {
      ok: true,
      value: output,
      metrics: {
        runId: this.#runId,
        stepCount: this.#steps.length,
        errorCount: 0,
        completed: true,
      },
    };
  }

  async *stream(inputs: AsyncIterable<TInput>, runId: RunId): AsyncGenerator<TOutput> {
    for await (const input of inputs) {
      const result = await this.execute(input);
      if (!result.ok) {
        throw new Error(`pipeline failed in run ${runId} :: ${result.error.reason}`);
      }
      yield result.value;
    }
  }

  getRunId(): RunId {
    return this.#runId;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }
}

export const createPipeline = <
  TInput,
  TOutput,
>(
  runId: RunId,
  steps: readonly RuntimePipelineStep<TInput, TOutput>[],
): Pipeline<TInput, TOutput> => {
  return new Pipeline(
    runId,
    steps.map((step) => ({
      kind: step.kind,
      label: step.label,
      run: async (input: unknown) => {
        const result = await step.run(input as TInput);
        return result as unknown;
      },
    })),
  );
};

export const buildPipelineFromPlugins = <
  TInput,
  TOutput,
>(runId: RunId, plugins: readonly RuntimePlugin<string, TInput, TOutput>[]): Pipeline<TInput, TOutput> => {
  const steps = plugins.map<RuntimePipelineStep<TInput, TOutput>>((plugin) => ({
    kind: 'transform',
    label: plugin.name,
    run: async (input) => {
      const output = await plugin.run({
        traceId: `trace:${runId}:${plugin.name}`,
        payload: input,
        context: {
          tenant: 'tenant:global',
          workspace: 'ws:global',
          runId,
          startedAt: new Date(),
        },
      });
      return output.result as TOutput;
    },
  }));

  return createPipeline(runId, steps);
};
