import {
  AsyncLease,
  type AsyncDisposableStackLike,
  collectAsyncIterable,
  createAsyncDisposableStack,
  createSignedTrace,
  type SynthesisPluginName,
  type StageName,
  type SynthesisTraceId,
} from '@shared/recovery-synthesis-runtime';
import type { NoInfer } from '@shared/type-level';

import type { SynthesisRuntimeId, SynthesisWorkspace } from './synthesis-types';
import { createRunToken } from './synthesis-advanced-types';

export type StreamEventKind = 'started' | 'tick' | 'artifact' | 'finished' | 'error';

export interface StreamEvent<TPayload = unknown> {
  readonly kind: StreamEventKind;
  readonly traceId: SynthesisTraceId;
  readonly at: string;
  readonly plugin: SynthesisPluginName;
  readonly stage: StageName;
  readonly payload: TPayload;
}

export interface StreamSubscription {
  unsubscribe(): void;
  readonly closed: boolean;
}

export interface StreamSink<TPayload = unknown> {
  next(event: StreamEvent<TPayload>): void;
  error(error: unknown): void;
  complete(): void;
}

export type StreamWriter<TPayload = unknown> = (emit: StreamSink<TPayload>) => void | PromiseLike<void>;

export interface StreamEnvelope<TPayload = unknown> {
  readonly streamId: `stream:${string}`;
  readonly events: readonly StreamEvent<TPayload>[];
  readonly runToken: string;
}

type WorkspaceIterable = AsyncGenerator<StreamEvent<{ plugin: SynthesisPluginName; latency: number }>>;

const streamId = (value: string): `stream:${string}` => `stream:${value}`;

class EventCollector<TPayload> {
  readonly #events: StreamEvent<TPayload>[] = [];
  #closed = false;
  readonly #observers = new Set<StreamSink<TPayload>>();

  add(observer: StreamSink<TPayload>): StreamSubscription {
    this.#observers.add(observer);
    return {
      closed: false,
      unsubscribe: () => {
        this.#observers.delete(observer);
        observer.complete();
      },
    };
  }

  emit(event: StreamEvent<TPayload>): void {
    if (this.#closed) {
      return;
    }
    this.#events.push(event);
    for (const observer of this.#observers) {
      observer.next(event);
    }
  }

  fail(error: unknown): void {
    for (const observer of this.#observers) {
      observer.error(error);
    }
    this.#closed = true;
    this.#observers.clear();
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const observer of this.#observers) {
      observer.complete();
    }
    this.#observers.clear();
  }

  snapshot(): readonly StreamEvent<TPayload>[] {
    return this.#events;
  }
}

const assertTrace = (value: string): SynthesisTraceId => value as SynthesisTraceId;

export class SynthesisEventBus {
  readonly #collector = new EventCollector<{
    plugin: SynthesisPluginName;
    latency: number;
  }>();
  readonly #stack: AsyncDisposableStackLike = createAsyncDisposableStack();
  readonly #trace: SynthesisTraceId;
  readonly #streamId: `stream:${string}`;

  constructor(seed: string) {
    this.#trace = assertTrace(seed);
    this.#streamId = streamId(seed);
    this.#stack.use({
      [Symbol.dispose]: () => this.#collector.close(),
      [Symbol.asyncDispose]: () => {
        this.#collector.close();
      },
    } as AsyncLease);
  }

  subscribe(sink: StreamSink<{ plugin: SynthesisPluginName; latency: number }>): StreamSubscription {
    for (const event of this.#collector.snapshot()) {
      sink.next(event);
    }
    return this.#collector.add(sink);
  }

  emitPlugin<TPayload>(
    plugin: SynthesisPluginName,
    stage: StageName,
    payload: TPayload,
    latencyMs = 0,
  ): void {
    const normalizedLatency = Math.max(0, Math.floor(latencyMs));
    this.#collector.emit({
      kind: 'artifact',
      traceId: this.#trace,
      at: new Date().toISOString(),
      plugin,
      stage,
      payload: {
        plugin,
        latency: normalizedLatency,
      },
    });

    if ('warnings' in (payload as { warnings?: unknown[] })) {
      void payload;
    }
  }

  async *stream(
    writer: StreamWriter<{ plugin: SynthesisPluginName; latency: number }>,
  ): WorkspaceIterable {
    const started: StreamEvent<{ plugin: SynthesisPluginName; latency: number }> = {
      kind: 'started',
      traceId: this.#trace,
      at: new Date().toISOString(),
      plugin: 'plugin:gateway' as SynthesisPluginName,
      stage: 'stage:bootstrap' as StageName,
      payload: { plugin: 'plugin:gateway' as SynthesisPluginName, latency: 0 },
    };

    yield started;

    await Promise.resolve(
      writer({
        next: (event: StreamEvent<{ plugin: SynthesisPluginName; latency: number }>) => {
          this.emitPlugin(event.payload.plugin, event.stage, event.payload, event.payload.latency);
        },
        error: (error: unknown) => {
          this.emitPlugin(
            'plugin:writer' as SynthesisPluginName,
            'stage:error' as StageName,
            { plugin: 'plugin:writer' as SynthesisPluginName, latency: 0 },
            0,
          );
        },
        complete: () => {
          this.emitPlugin(
            'plugin:writer' as SynthesisPluginName,
            'stage:completed' as StageName,
            { plugin: 'plugin:writer' as SynthesisPluginName, latency: 0 },
            0,
          );
        },
      }),
    );

    yield {
      kind: 'finished',
      traceId: this.#trace,
      at: new Date().toISOString(),
      plugin: 'plugin:writer' as SynthesisPluginName,
      stage: 'stage:completed' as StageName,
      payload: { plugin: 'plugin:writer' as SynthesisPluginName, latency: 0 },
    };
  }

  async toWorkspace(source: WorkspaceIterable, workspaceId: string): Promise<SynthesisWorkspace> {
    try {
      for await (const event of source) {
        this.emitPlugin(event.payload.plugin, event.stage, event.payload, (event.payload as { latency: number }).latency);
      }

      return {
        runtimeId: createRunToken(workspaceId) as unknown as SynthesisRuntimeId,
        traceId: this.#trace,
        events: this.#collector.snapshot().map((event) => ({
          traceId: event.traceId,
          kind: event.kind === 'artifact' ? 'store' : 'plan',
          payload: { source: 'governed', commandOrder: [] },
          when: event.at,
        })),
        timeline: [],
        latestOutput: undefined,
      };
    } finally {
      await this.#stack[Symbol.asyncDispose]();
    }
  }

  async close(): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }

  get streamId(): `stream:${string}` {
    return this.#streamId;
  }

  get traceIdValue(): SynthesisTraceId {
    return this.#trace;
  }
}

export const collectTelemetry = async <T extends AsyncIterable<StreamEvent<{ plugin: SynthesisPluginName; latency: number }>>>(
  events: NoInfer<T>,
): Promise<{
  readonly streamId: `stream:${string}`;
  readonly eventCount: number;
  readonly firstAt: string;
}> => {
  const snapshot = await collectAsyncIterable(events);
  const first = snapshot.at(0);

  return {
    streamId: streamId(String(first?.traceId ?? 'unknown')),
    eventCount: snapshot.length,
    firstAt: first?.at ?? new Date().toISOString(),
  };
};

export const withWorkspaceStream = async <T>(
  workspace: SynthesisWorkspace,
  callback: (writer: StreamWriter<{ plugin: SynthesisPluginName; latency: number }>) => PromiseLike<T> | T,
): Promise<T> => {
  const bus = new SynthesisEventBus(createSignedTrace('tenant', `stream-${workspace.runtimeId}`));

  try {
    return await callback((emit) => {
      emit.next({
        kind: 'artifact',
        traceId: bus.traceIdValue,
        at: new Date().toISOString(),
        plugin: 'plugin:writer' as SynthesisPluginName,
        stage: 'stage:bootstrap' as StageName,
        payload: { plugin: 'plugin:writer' as SynthesisPluginName, latency: 0 },
      });
      emit.complete();
      return;
    });
  } finally {
    await bus.close();
  }
};
