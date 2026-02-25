import type { OrchestrationRunId } from './types';

export interface ChronicleArtifact<T = unknown> {
  readonly runId: OrchestrationRunId;
  readonly at: number;
  readonly payload: T;
}

export interface ArtifactAdapter<TIn, TOut> {
  open(signal: AbortSignal): Promise<void>;
  emit(value: TIn): Promise<void>;
  read(): Promise<TOut | undefined>;
  close(): Promise<void>;
}

export class MemoryArtifactAdapter<T> implements ArtifactAdapter<T, T>, AsyncDisposable {
  readonly #events: ChronicleArtifact<T>[] = [];
  readonly #name: string;
  #closed = false;
  #disposed = false;

  public constructor(name: string) {
    this.#name = name;
  }

  public async open(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new DOMException('artifact adapter aborted', 'AbortError');
    }
  }

  public async emit(value: T): Promise<void> {
    if (this.#closed || this.#disposed) return;
    this.#events.push({
      runId: `run:${Date.now()}` as OrchestrationRunId,
      at: Date.now(),
      payload: value,
    });
  }

  public async read(): Promise<T | undefined> {
    const head = this.#events.shift();
    return head?.payload;
  }

  public async close(): Promise<void> {
    this.#closed = true;
    if (this.#events.length > 0) {
      this.#events.length = 0;
    }
  }

  public get name(): string {
    return this.#name;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    await this.close();
  }
}
