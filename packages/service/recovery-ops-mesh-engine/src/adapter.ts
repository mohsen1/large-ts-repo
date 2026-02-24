import { randomUUID } from 'node:crypto';
import { fail, ok, type Result } from '@shared/result';
import type {
  MeshEngineAdapter,
  EngineAdapterId,
  MeshRuntimeCommand,
  MeshPayloadFor,
  MeshSignalKind,
  EngineRunToken,
  MeshTimelineEvent,
  MeshExecutionContext,
} from './types';

export class ConsoleAdapter implements MeshEngineAdapter {
  readonly adapterId: EngineAdapterId;
  readonly capabilities: readonly MeshSignalKind[];
  readonly displayName: string;
  #connected = false;

  constructor(id: string, capabilities: readonly MeshSignalKind[]) {
    this.adapterId = id as EngineAdapterId;
    this.capabilities = capabilities;
    this.displayName = `console:${id}`;
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  async execute<TSignal extends MeshSignalKind>(
    command: MeshRuntimeCommand<TSignal>,
  ): Promise<MeshPayloadFor<TSignal>[]> {
    if (!this.#connected) {
      throw new Error('adapter not connected');
    }
    if (!this.capabilities.includes(command.signal.kind)) {
      throw new Error(`unsupported kind ${command.signal.kind}`);
    }
    return [{
      kind: command.signal.kind,
      payload: command.signal.payload,
    } as MeshPayloadFor<TSignal>];
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.disconnect();
  }
}

export class TimedAdapter implements MeshEngineAdapter {
  readonly adapterId: EngineAdapterId;
  readonly capabilities: readonly MeshSignalKind[];
  readonly displayName: string;
  #connected = false;

  constructor(adapters: readonly MeshSignalKind[]) {
    this.adapterId = `timed-${randomUUID()}` as EngineAdapterId;
    this.capabilities = adapters;
    this.displayName = 'timed-adapter';
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  async execute<TSignal extends MeshSignalKind>(
    command: MeshRuntimeCommand<TSignal>,
  ): Promise<MeshPayloadFor<TSignal>[]> {
    if (!this.#connected) {
      throw new Error('adapter not connected');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    return [
      {
        kind: command.signal.kind,
        payload: command.signal.payload,
      } as MeshPayloadFor<TSignal>,
    ];
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.disconnect();
  }
}

export async function runWithDisposables<T>(
  runId: EngineRunToken,
  adapters: readonly MeshEngineAdapter[],
  invoke: (connected: readonly MeshEngineAdapter[]) => Promise<T>,
): Promise<Result<T, Error>> {
  const disposeStack = new AsyncDisposableStack();
  const connected: MeshEngineAdapter[] = [];

  try {
    for (const adapter of adapters) {
      await adapter.connect();
      connected.push(adapter);
      disposeStack.defer(async () => adapter.disconnect());
    }
    return ok(await invoke(connected));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(`run failed ${runId}`));
  } finally {
    await disposeStack.disposeAsync();
  }
}

export async function collectTimeline(
  adapter: MeshEngineAdapter,
  context: MeshExecutionContext,
  token: string,
): Promise<MeshTimelineEvent[]> {
  await adapter.connect();
  const started = Date.now();

  return context.nodes.map((node, index) => ({
    eventId: `${token}-${index}-${context.runId}` as MeshTimelineEvent['eventId'],
    at: started + index,
    nodeId: node.id,
    kind: 'telemetry',
    payload: {
      metrics: {
        [adapter.adapterId]: index,
        elapsed: Date.now() - context.startedAt,
      },
    },
  }));
}

export function createTimelineBuilder() {
  const seen = new Map<string, MeshTimelineEvent['at']>();
  return {
    push(event: MeshTimelineEvent) {
      seen.set(event.eventId, event.at);
      return Object.fromEntries(seen);
    },
    entries() {
      return [...seen.entries()] as const;
    },
  };
}
