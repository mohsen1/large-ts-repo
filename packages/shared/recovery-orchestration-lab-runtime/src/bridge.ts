import { EventEmitter } from 'node:events';
import type { RuntimePluginOutput } from './registry.js';
import { runtimeId, type RunId } from './ids.js';
import { type RuntimeTopology, routePrefix } from './topology.js';

export interface BridgeMessage {
  readonly kind: string;
  readonly payload: unknown;
}

export interface BridgeAdapter {
  readonly name: string;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(signal: AbortSignal): Promise<void>;
  publish(message: BridgeMessage): Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}

export interface BridgeSession {
  readonly runId: RunId;
  readonly topology: RuntimeTopology;
  readonly publish: (output: RuntimePluginOutput<unknown>) => Promise<void>;
  readonly done: () => Promise<void>;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export class EventBridgeAdapter implements BridgeAdapter {
  #emitter = new EventEmitter();
  #closed = false;

  constructor(readonly name: string) {}

  async connect(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new Error('bridge aborted before connect');
    }
    this.#closed = false;
  }

  async disconnect(_signal: AbortSignal): Promise<void> {
    this.#closed = true;
    this.#emitter.removeAllListeners();
  }

  async publish(message: BridgeMessage): Promise<void> {
    if (this.#closed) {
      throw new Error('bridge disconnected');
    }
    this.#emitter.emit(message.kind, message.payload);
  }

  subscribe<T>(kind: string, listener: (payload: T) => void): void {
    this.#emitter.on(kind, listener);
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.disconnect(new AbortController().signal);
  }
}

export const openBridgeSession = async (
  runId: RunId,
  adapter: BridgeAdapter,
  topology: RuntimeTopology,
  routes: readonly string[],
): Promise<BridgeSession> => {
  const abort = new AbortController();
  await using _scope = adapter;
  await adapter.connect(abort.signal);

  const session: BridgeSession = {
    runId,
    topology,
    publish: async (output) => {
      await adapter.publish({
        kind: 'runtime:event',
        payload: {
          session: runId,
          runId: runtimeId.run('global', runId),
          output,
        },
      });
    },
    done: async () => {
      await adapter.disconnect(abort.signal);
    },
  };

  for (const route of routePrefix('runtime', routes)) {
    await adapter.publish({ kind: 'runtime:route', payload: { runId, route } });
  }

  return session;
};
