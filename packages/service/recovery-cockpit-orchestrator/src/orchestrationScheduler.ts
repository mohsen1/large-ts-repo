import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { RecoveryBlueprintOrchestrator } from './blueprintOrchestrator';

export type SchedulerWorkItem = {
  readonly id: string;
  readonly plan: RecoveryPlan;
  readonly namespace: string;
  readonly mode: 'analysis' | 'simulate' | 'execute' | 'verify';
};

type SchedulerQueueRecord = {
  readonly work: SchedulerWorkItem;
  readonly attempts: number;
  readonly insertedAt: string;
  readonly runKey?: string;
};

export type SchedulerConfig = {
  readonly concurrency: number;
  readonly pollMs: number;
  readonly retryMs: number;
  readonly maxAttempts: number;
};

const defaults: SchedulerConfig = {
  concurrency: 2,
  pollMs: 2_500,
  retryMs: 250,
  maxAttempts: 2,
};

const normalizeConcurrency = (value: number): number => Math.max(1, Math.min(16, Math.floor(value)));

const normalizeAttempts = (value: number): number => Math.max(1, Math.floor(value));

export class BlueprintScheduler {
  readonly #queue: SchedulerQueueRecord[] = [];
  readonly #running = new Map<string, Promise<unknown>>();
  readonly #orchestrator = new RecoveryBlueprintOrchestrator();
  #runningNow = 0;

  public constructor(private readonly config: Partial<SchedulerConfig> = {}) {}

  public schedule(item: SchedulerWorkItem): string {
    const run = `run:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this.#queue.push({
      work: item,
      attempts: 0,
      insertedAt: new Date().toISOString(),
    });
    return run;
  }

  public next(): SchedulerWorkItem | undefined {
    return this.#queue.shift()?.work;
  }

  public queuedCount(): number {
    return this.#queue.length;
  }

  public async tick(): Promise<number> {
    const concurrency = normalizeConcurrency(this.config.concurrency ?? defaults.concurrency);
    const runningAllowance = Math.max(0, concurrency - this.#runningNow);
    const runCount = Math.min(this.#queue.length, runningAllowance);
    const started: Promise<unknown>[] = [];

    for (let index = 0; index < runCount; index += 1) {
      const next = this.next();
      if (!next) {
        return index;
      }

      const queueEntry: SchedulerQueueRecord = {
        work: next,
        attempts: 0,
        insertedAt: new Date().toISOString(),
      };
      const runKey = `${next.id}:run:${Date.now().toString(36)}:${index}`;
      const execution = this.execute({ ...queueEntry, runKey });
      started.push(execution);
      this.#running.set(runKey, execution);
      this.#runningNow += 1;
    }

    await Promise.all(started);
    return started.length;
  }

  public async drain(): Promise<void> {
    while (this.#queue.length > 0 || this.#running.size > 0) {
      await this.tick();
      if (this.#queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.pollMs ?? defaults.pollMs));
      }
    }
  }

  public snapshot(): { queued: number; running: number } {
    return { queued: this.#queue.length, running: this.#running.size };
  }

  private async execute(entry: SchedulerQueueRecord): Promise<Result<boolean, string>> {
    const context = { ...entry.work };
    const attemptLimit = normalizeAttempts(this.config.maxAttempts ?? defaults.maxAttempts);
    const backoffMultiplier = Math.max(0, entry.attempts);
    const backoffBase = Math.min(2 ** backoffMultiplier * (this.config.retryMs ?? defaults.retryMs), 5_000);

    await using runnerStack = new AsyncDisposableStack();
    runnerStack.defer(() => {
      if (entry.runKey !== undefined) {
        this.#running.delete(entry.runKey);
      }
      this.#runningNow = Math.max(0, this.#runningNow - 1);
    });

    try {
      const result = await this.#orchestrator.execute(context.plan, context.mode);
      if (!result.ok) {
        return fail(result.error);
      }
      return ok(true);
    } catch (error) {
      if (entry.attempts + 1 >= attemptLimit) {
        return fail((error as Error).message);
      }

      const nextEntry: SchedulerQueueRecord = {
        work: {
          ...context,
          id: `${context.id}:retry:${entry.attempts + 1}`,
        },
        attempts: entry.attempts + 1,
        insertedAt: new Date().toISOString(),
      };
      this.#queue.push(nextEntry);
      await new Promise((resolve) => setTimeout(resolve, backoffBase));
      return fail((error as Error).message);
    }
  }
}

export const makeScheduler = (config: Partial<SchedulerConfig> = {}): BlueprintScheduler =>
  new BlueprintScheduler(config);
