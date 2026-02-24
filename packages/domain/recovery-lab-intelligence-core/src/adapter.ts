import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { SignalEvent, WorkspaceId, RunId, StrategyPhase, StrategyMode, StrategyLane } from './types';

export interface StrategyAdapter {
  readonly name: string;
  open: (workspace: WorkspaceId) => Promise<void>;
  emit: (event: SignalEvent) => Promise<void>;
  close: () => Promise<void>;
}

export interface EventEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly emittedAt: string;
  readonly payload: TPayload;
}

export interface TelemetryAdapter {
  publish(events: readonly SignalEvent[]): Promise<number>;
}

interface BufferState<T> {
  readonly at: number;
  readonly value: T;
}

export class MemoryTelemetryAdapter implements StrategyAdapter {
  readonly name = 'memory';
  readonly #workspace: WorkspaceId;
  readonly #events: BufferState<SignalEvent>[] = [];
  #opened = false;
  #closed = false;

  constructor(workspace: WorkspaceId) {
    this.#workspace = workspace;
  }

  get emittedCount(): number {
    return this.#events.length;
  }

  async open(workspace: WorkspaceId): Promise<void> {
    if (this.#closed) {
      throw new Error(`adapter closed for ${this.#workspace}`);
    }
    if (workspace !== this.#workspace) {
      throw new Error(`workspace mismatch: ${workspace} !== ${this.#workspace}`);
    }
    this.#opened = true;
  }

  async emit(event: SignalEvent): Promise<void> {
    if (!this.#opened || this.#closed) {
      throw new Error('adapter not ready');
    }
    const detail = (event.detail as Record<string, unknown>) ?? {};
    const mergedDetail =
      typeof detail === 'object' && detail !== null && !Array.isArray(detail)
        ? { ...detail, workspace: this.#workspace }
        : { detail, workspace: this.#workspace };
    this.#events.push({
      at: Date.now(),
      value: {
        ...event,
        detail: mergedDetail,
      },
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#events.length = 0;
  }

  get events(): readonly BufferState<SignalEvent>[] {
    return [...this.#events];
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
    this.#events.length = 0;
  }
}

export class ConsoleTelemetryAdapter implements StrategyAdapter {
  readonly name: string;
  #started = false;
  #closed = false;

  constructor(name = 'console') {
    this.name = name;
  }

  async open(_workspace: WorkspaceId): Promise<void> {
    this.#started = true;
    return Promise.resolve();
  }

  async emit(event: SignalEvent): Promise<void> {
    if (this.#closed) return;
    if (!this.#started) {
      throw new Error('adapter not opened');
    }
    console.info(`[${this.name}] ${event.source}/${event.severity}:`, event.detail);
  }

  async close(): Promise<void> {
    this.#closed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }
}

export class NoopTelemetryAdapter implements TelemetryAdapter {
  async publish(_events: readonly SignalEvent[]): Promise<number> {
    return _events.length;
  }
}

export interface PublishReport {
  readonly success: boolean;
  readonly published: number;
  readonly skipped: number;
}

export const publishEvents = async (
  events: readonly SignalEvent[],
  adapter: TelemetryAdapter,
): Promise<PublishReport> => {
  const published = await adapter.publish(events);
  return {
    success: published >= 0,
    published,
    skipped: 0,
  };
};

export interface StageSpan {
  readonly runId: RunId;
  readonly workspace: WorkspaceId;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
}

export const toAdapterEnvelope = <TPayload>(
  phase: StrategyPhase<TPayload>,
  event: SignalEvent<TPayload>,
): EventEnvelope<SignalEvent<TPayload>> => ({
  id: `${phase.runId}:${phase.phase}:${Date.now()}`,
  emittedAt: new Date().toISOString(),
  payload: event,
});

export const routeEvent = <TPayload>(phase: StrategyPhase<TPayload>): string =>
  `${phase.workspace}/${phase.scenario}/${phase.phase}` as string;

export const flushAdapter = async (
  adapter: StrategyAdapter,
  workspace: WorkspaceId,
  events: readonly SignalEvent[],
): Promise<Result<PublishReport>> => {
  try {
    await adapter.open(workspace);
    for (const event of events) {
      await adapter.emit(event);
    }
    await adapter.close();
    return ok({
      success: true,
      published: events.length,
      skipped: 0,
    });
  } catch (error) {
    await adapter.close();
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
};
