import { withRetry } from '@shared/util';
import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { PlaybookAutomationSessionId, PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';

interface AsyncDisposableLike {
  [Symbol.asyncDispose](): PromiseLike<void>;
}

interface AsyncDisposableStackLike extends AsyncDisposableLike {
  use<T extends AsyncDisposableLike>(resource: T): T;
}

class FallbackAsyncDisposableStack implements AsyncDisposableStackLike {
  private readonly stack: Array<AsyncDisposableLike> = [];

  use<T extends AsyncDisposableLike>(resource: T): T {
    this.stack.push(resource);
    return resource;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const resource of this.stack.reverse()) {
      await resource[Symbol.asyncDispose]();
    }
  }
}

const AsyncStackCtor = (globalThis as {
  AsyncDisposableStack?: new () => AsyncDisposableStackLike;
}).AsyncDisposableStack;

type WorkFn<TInput, TOutput> = (value: TInput) => Promise<TOutput>;

export interface WorkSlice<TInput = unknown, TOutput = unknown> {
  readonly id: PlaybookAutomationSessionId;
  readonly runId: PlaybookAutomationRunId;
  readonly execute: WorkFn<TInput, TOutput>;
}

class AsyncExecutionSlot {
  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }

  async *steps<T>(values: readonly T[]): AsyncGenerator<T, void, void> {
    for (const value of values) {
      yield value;
    }
  }
}

export const runWithDisposables = async <TInput, TOutput>(
  input: TInput,
  handler: (value: TInput) => Promise<TOutput>,
): Promise<Result<TOutput, string>> => {
  const stack = new (AsyncStackCtor ?? FallbackAsyncDisposableStack)();
  await using _scope = stack;
  const slot = stack.use(new AsyncExecutionSlot());
  try {
    const output = await handler(input);
    return ok(output);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'automation-failed');
  } finally {
    await withRetry(
      async () => {
        await slot[Symbol.asyncDispose]();
        return undefined;
      },
      { times: 1, delayMs: 0 },
    ).catch(() => undefined);
  }
};

export class AutomationScheduler {
  private readonly queued = new Map<string, WorkSlice<unknown, unknown>>();

  enqueue<TInput, TOutput>(sessionId: string, runId: string, execute: (value: TInput) => Promise<TOutput>): void {
    this.queued.set(`${sessionId}:${runId}`, {
      id: withBrand(sessionId, 'PlaybookAutomationSessionId'),
      runId: withBrand(runId, 'PlaybookAutomationRunId'),
      execute: execute as WorkSlice<unknown, unknown>['execute'],
    });
  }

  async runQueued<TInput, TOutput>(sessionId: string, runId: string, input: TInput): Promise<Result<TOutput, string>> {
    const key = `${sessionId}:${runId}`;
    const work = this.queued.get(key);
    if (!work) return fail('work-not-found');
    return runWithDisposables(input, work.execute as (value: TInput) => Promise<TOutput>);
  }

  clear(): void {
    this.queued.clear();
  }
}
