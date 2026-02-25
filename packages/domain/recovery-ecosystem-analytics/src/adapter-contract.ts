import { asNamespace, asRun, asSession, asSignal, asTenant, asWindow } from './identifiers';
import { mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';
import type {
  PluginNode,
  PluginRunInput,
  PluginRunInput as TypedPluginRunInput,
  PluginRunResult,
  PluginTraceId,
} from './typed-plugin-types';

export type AdapterProtocol = 'noop' | 'batch' | 'stream';
export type AdapterState = 'idle' | 'open' | 'closed' | 'error';

export interface AdapterEvent<TPayload = unknown> {
  readonly id: PluginTraceId;
  readonly kind: `adapter:${string}`;
  readonly payload: TPayload;
  readonly timestamp: string;
}

export interface AdapterContract<TInput = unknown, TOutput = unknown> {
  readonly state: AdapterState;
  readonly protocol: AdapterProtocol;
  open(tenant: string): Promise<void>;
  append(input: TInput): Promise<void>;
  flush(): Promise<readonly TOutput[]>;
  close(): Promise<void>;
}

export interface AdapterDiagnostics {
  readonly emitted: number;
  readonly failed: number;
  readonly retries: number;
  readonly latencyMs: number;
}

type AdapterTrace<TPayload = unknown> = {
  readonly runId: PluginTraceId;
  readonly event: AdapterEvent<TPayload>;
  readonly plugin: string;
};

export interface AdapterEnvelope<TPayload extends PluginRunInput = PluginRunInput> {
  readonly runId: ReturnType<typeof asRun>;
  readonly plugin: PluginNode;
  readonly event: TPayload;
  readonly envelopeId: string;
  readonly diagnostics: AdapterDiagnostics;
}

const isAdapterEvent = <T>(value: unknown): value is AdapterEvent<T> =>
  !!value &&
  typeof value === 'object' &&
  'kind' in (value as Record<string, unknown>) &&
  String((value as Record<string, unknown>).kind).startsWith('adapter:');

const normalizePayloadJson = (payload: unknown): JsonValue => {
  if (
    payload === null ||
    typeof payload === 'string' ||
    typeof payload === 'number' ||
    typeof payload === 'boolean'
  ) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(normalizePayloadJson) as JsonValue;
  }
  if (typeof payload === 'object') {
    return Object.entries(payload).reduce<Record<string, JsonValue>>((acc, [key, value]) => {
      acc[key] = normalizePayloadJson(value);
      return acc;
    }, {});
  }
  return String(payload);
};

export class PluginEventAdapter implements AdapterContract<TypedPluginRunInput, PluginRunResult> {
  #protocol: AdapterProtocol;
  #state = { status: 'idle' as AdapterState, openedAt: undefined as string | undefined };
  #events: AdapterEvent<TypedPluginRunInput>[] = [];
  #signalCount = 0;

  constructor(protocol: AdapterProtocol) {
    this.#protocol = protocol;
  }

  get protocol(): AdapterProtocol {
    return this.#protocol;
  }

  get state(): AdapterState {
    return this.#state.status;
  }

  async open(tenant: string): Promise<void> {
    this.#state.status = 'open';
    this.#state.openedAt = new Date().toISOString();
    this.#events.push({
      id: (`trace:open:${tenant}:${Date.now()}` as PluginTraceId),
      kind: 'adapter:open',
      payload: {
        runId: asRun(`run:${tenant}`),
        kind: 'signal:adapter.open' as `signal:${string}`,
        namespace: asNamespace('namespace:adapter'),
        at: this.#state.openedAt,
        value: 0,
        payload: {} as JsonValue,
      },
      timestamp: this.#state.openedAt,
    });
  }

  async append(input: TypedPluginRunInput): Promise<void> {
    if (this.#state.status !== 'open') {
      throw new Error('adapter is not open');
    }
    const event: AdapterEvent<TypedPluginRunInput> = {
      id: (`trace:${input.runId}` as PluginTraceId),
      kind: 'adapter:append',
      payload: input,
      timestamp: new Date().toISOString(),
    };
    if (isAdapterEvent(event) && event.kind.startsWith('adapter:')) {
      this.#events.push(event);
      this.#signalCount += 1;
    }
  }

  async flush(): Promise<readonly PluginRunResult[]> {
    const out = mapWithIteratorHelpers(this.#events, (event) => ({
      plugin: `plugin:adapter-${event.id}` as const,
      accepted: true,
      signalCount: 1,
      payload: normalizePayloadJson(event.payload),
      diagnostics: [{ step: event.kind, latencyMs: 1 }],
    }) as PluginRunResult);
    this.#signalCount = 0;
    return out as readonly PluginRunResult[];
  }

  async close(): Promise<void> {
    this.#state.status = 'closed';
    this.#events.length = 0;
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return this.close();
  }

  [Symbol.dispose](): void {
    this.#events.length = 0;
    this.#state.status = 'closed';
  }
}

export const createAdapterDiagnostics = (events: readonly AdapterEvent[]): AdapterDiagnostics =>
  events.reduce(
    (acc, event) => ({
      emitted: acc.emitted + (event.kind.startsWith('adapter:') ? 1 : 0),
      failed: acc.failed + (event.kind === 'adapter:error' ? 1 : 0),
      retries: acc.retries + (event.kind === 'adapter:retry' ? 1 : 0),
      latencyMs: acc.latencyMs + new Date(event.timestamp).getMilliseconds(),
    }),
    { emitted: 0, failed: 0, retries: 0, latencyMs: 0 } as AdapterDiagnostics,
  );

export const mapAdapterTraces = <T>(events: readonly AdapterEvent<T>[]): readonly AdapterTrace<T>[] =>
  events.map((event) => ({
    runId: (`trace:${Date.now()}` as PluginTraceId),
    event,
    plugin: event.kind,
  }));

export const isAdapterCompatible = <T extends PluginRunResult>(result: T, expected: number): result is T & { accepted: boolean } =>
  result.signalCount >= 0 && expected >= 0;

export const collectAdapterPlugins = (plugins: readonly PluginNode[]): readonly string[] =>
  plugins.flatMap((entry) => [entry.name, ...entry.dependsOn, ...entry.inputKinds, ...entry.outputKinds]);

export const normalizeAdapterEnvelope = (
  runId: string,
  plugin: PluginNode,
  payload: TypedPluginRunInput,
): AdapterEnvelope<TypedPluginRunInput> => ({
  runId: asRun(runId),
  plugin,
  event: payload,
  envelopeId: `envelope:${runId}` as const,
  diagnostics: createAdapterDiagnostics([]),
});

export const normalizeAdapterPayload = (payload: JsonValue): JsonValue => payload;

export const adapterScope = {
  tenant: asTenant('tenant:adapter'),
  session: asSession('session:adapter'),
  window: asWindow('window:adapter'),
  parse: (seed: string): PluginRunInput => ({
    runId: asRun(seed),
    kind: `signal:${seed}` as `signal:${string}`,
    namespace: asNamespace('namespace:adapter'),
    at: new Date().toISOString(),
    value: 1,
    payload: { source: 'adapter' },
  }),
  toSignal: (value: string) => asSignal(value),
};
