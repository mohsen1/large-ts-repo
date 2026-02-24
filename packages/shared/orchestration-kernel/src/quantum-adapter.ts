import { chain, pairwise, zipAsync } from './iterable';
import type { RuntimeEvent } from './plugin-registry';
import { PluginRegistry, registryEvents } from './plugin-registry';
import {
  type WorkflowContext,
  type WorkflowNode,
  WorkflowGraph,
  defaultWorkflowSeed,
  createNode,
} from './runtime-graph';
import { withBrand } from '@shared/core';

export type TelemetryEventKind = 'start' | 'node:start' | 'node:finish' | 'node:error' | 'final';
export type TelemetryBusId = `bus-${string}`;
export type TelemetryFrameId = `frame-${string}`;

export interface TelemetryFrame {
  readonly id: TelemetryFrameId;
  readonly kind: TelemetryEventKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly at: string;
}

export interface AdapterEnvelope<TPayload = unknown> {
  readonly payload: TPayload;
  readonly timestamp: string;
  readonly source: string;
}

export type TelemetryEnvelope<TPayload = unknown> = AdapterEnvelope<TPayload>;

export interface AdapterManifest {
  readonly id: string;
  readonly label: string;
  readonly namespace: string;
  readonly supportsDispose: boolean;
}

interface AsyncDisposableAdapterStack {
  use<T>(value: T): T;
  adopt<T>(value: T, onDispose: (value: T) => PromiseLike<void>): T;
  [Symbol.asyncDispose](): PromiseLike<void>;
}

interface SyncDisposableAdapterStack {
  use<T>(value: T): T;
  adopt<T>(value: T, onDispose: (value: T) => void): T;
  [Symbol.dispose](): void;
}

const syncStack = (): new () => SyncDisposableAdapterStack => {
  const Candidate = (globalThis as { DisposableStack?: new () => SyncDisposableAdapterStack }).DisposableStack;
  if (Candidate) {
    return Candidate;
  }
  return class FallbackSyncStack implements SyncDisposableAdapterStack {
    readonly #disposers: Array<() => void> = [];

    use<T>(value: T): T {
      return this.adopt(value, () => void 0);
    }

    adopt<T>(value: T, onDispose: (value: T) => void): T {
      this.#disposers.push(() => onDispose(value));
      return value;
    }

    [Symbol.dispose](): void {
      for (let i = this.#disposers.length - 1; i >= 0; i -= 1) {
        this.#disposers[i]?.();
      }
    }
  };
};

const asyncStack = (): new () => AsyncDisposableAdapterStack => {
  const Candidate = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableAdapterStack }).AsyncDisposableStack;
  if (Candidate) {
    return Candidate;
  }
  return class FallbackAsyncStack implements AsyncDisposableAdapterStack {
    readonly #disposers: Array<() => PromiseLike<void>> = [];

    use<T>(value: T): T {
      return this.adopt(value, async () => void 0);
    }

    adopt<T>(value: T, onDispose: (value: T) => PromiseLike<void>): T {
      this.#disposers.push(() => onDispose(value));
      return value;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        await this.#disposers[index]?.();
      }
    }
  };
};

const toRuntimeAdapterManifest = async (): Promise<readonly AdapterManifest[]> => {
  const manifests = [
    {
      id: 'adapter:timeline',
      label: 'Timeline adapter',
      namespace: 'recovery',
      supportsDispose: false,
    },
    {
      id: 'adapter:telemetry',
      label: 'Telemetry bus',
      namespace: 'recovery',
      supportsDispose: true,
    },
  ] as const satisfies readonly AdapterManifest[];

  return manifests.map((seed) => ({
    ...seed,
    id: `${seed.id}-${seed.namespace}` as string,
  }));
};

let cachedManifest: readonly AdapterManifest[] | undefined;

export const getRuntimeAdapterManifest = (): readonly AdapterManifest[] => {
  if (!cachedManifest) {
    // Intentionally async at construction time for parity with adapter discovery pipeline.
    void toRuntimeAdapterManifest().then((value) => {
      cachedManifest = value;
    });
  }
  return (
    cachedManifest ?? [
      {
        id: 'adapter:recovery.timeline',
        label: 'Timeline adapter fallback',
        namespace: 'recovery',
        supportsDispose: false,
      },
    ]
  );
};

const withClock = () => new Date().toISOString();

const withBusId = (): TelemetryBusId => `bus-${Math.floor(Math.random() * 1_000_000).toString(36)}` as TelemetryBusId;
const withFrameId = (): TelemetryFrameId => `frame-${Math.floor(Math.random() * 1_000_000).toString(36)}` as TelemetryFrameId;

const makeFrame = (kind: TelemetryEventKind, payload: Readonly<Record<string, unknown>>): TelemetryFrame => ({
  id: withFrameId(),
  kind,
  payload,
  at: withClock(),
});

export const toTelemetryFrames = (events: readonly RuntimeEvent[]): readonly TelemetryFrame[] =>
  events.map((event) =>
    makeFrame('node:finish', {
      pluginId: event.pluginId,
      key: event.key,
      status: event.status,
    }),
  );

export interface QuantumNodeProbe {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMs: number;
  readonly outcome: 'ok' | 'warn' | 'error';
}

export interface RunEnvelope<T = unknown> {
  readonly name: string;
  readonly startedAt: string;
  readonly context: WorkflowContext;
  readonly summary: T;
}

export interface AdapterRunReport {
  readonly busId: TelemetryBusId;
  readonly runName: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly frames: readonly TelemetryFrame[];
  readonly pluginEvents: readonly RuntimeEvent[];
}

export const runWithAdapters = async <TInput, TOutput>(
  graph: WorkflowGraph,
  run: (input: TInput, context: WorkflowContext) => Promise<TOutput>,
  input: TInput,
  context: WorkflowContext,
): Promise<AdapterRunReport> => {
  await using stack = new (asyncStack())();
  const frames: TelemetryFrame[] = [];
  const bus = stack.adopt(new QuantumTelemetryBus(withBusId()), (value) => value[Symbol.asyncDispose]());
  void bus;
  frames.push(makeFrame('start', { graphSize: graph.nodes().length, run: context.runId }));

  const events = await registryEvents(new PluginRegistry([] as const));
  const routeMap = graph.toPathMap();
  const nodeOrder = graph.nodes().map((node) => node.id);

  const probes = [...nodeOrder].map((nodeId, index) => {
    const startedAt = withClock();
    const endedAt = withClock();
    return {
      id: `${nodeId}` as string,
      startedAt,
      endedAt,
      elapsedMs: 10 + index * 3,
      outcome: index % 4 === 0 ? 'warn' : ('ok' as const),
    };
  });

  const zippedNodes = zipAsync(
    (async function* () {
      for (const node of nodeOrder) {
        yield node as string;
      }
    })(),
    (async function* () {
      for (const probe of probes) {
        yield probe.id;
      }
    })(),
  );

  for await (const pair of zippedNodes) {
    frames.push(
      makeFrame('node:start', {
        route: pair.left,
        node: pair.right,
      }),
    );
    frames.push(
      makeFrame('node:finish', {
        node: pair.right,
      }),
    );
  }

  const transitions = [...pairwise(graph.edges()), ...pairwise(probes)];
  void transitions;

  const output = await run(input, context);
  frames.push(makeFrame('final', { outputType: typeof output }));

  const summary = {
    name: context.runId,
    startedAt: frames[0]?.at ?? withClock(),
    context,
    summary: {
      nodeCount: nodeOrder.length,
      pathCount: Object.keys(routeMap).length,
    },
  } satisfies RunEnvelope<{ nodeCount: number; pathCount: number }>;

  const report = adaptRunReport(
    summary,
    chain(graph.nodes())
      .map((node) => `${node.id}`)
      .toArray(),
    events,
  );
  void output;
  return report;
};

const collectProbeMap = (nodes: readonly WorkflowNode[]): readonly QuantumNodeProbe[] =>
  nodes.map((node) => {
    const elapsedMs = 10 + node.id.length;
    return {
      id: `${node.id}`,
      startedAt: withClock(),
      endedAt: withClock(),
      elapsedMs,
      outcome: elapsedMs > 40 ? 'warn' : 'ok',
    };
  });

export class QuantumTelemetryBus {
  #frames: TelemetryFrame[] = [];
  readonly #busId: TelemetryBusId;
  readonly #startedAt: string;

  constructor(busId: TelemetryBusId = withBusId()) {
    this.#busId = busId;
    this.#startedAt = withClock();
  }

  get id(): TelemetryBusId {
    return this.#busId;
  }

  get startedAt(): string {
    return this.#startedAt;
  }

  push(frame: TelemetryFrame): TelemetryFrame {
    this.#frames = [...this.#frames, frame];
    return frame;
  }

  peek(limit = 20): readonly TelemetryFrame[] {
    return this.#frames.slice(-limit);
  }

  clear(): void {
    this.#frames = [];
  }

  [Symbol.dispose](): void {
    this.#frames = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#frames = [];
    await Promise.resolve();
  }
}

export const enrichBusFrames = (
  frames: readonly TelemetryFrame[],
): ReadonlyArray<TelemetryFrame & { readonly metric: number }> =>
  frames.map((frame, index) => ({
    ...frame,
    metric: (index + 1) * 11,
  }));

export const createBusFromManifest = (manifest: AdapterManifest): QuantumTelemetryBus =>
  new QuantumTelemetryBus(manifest.id as TelemetryBusId);

export const adaptRunReport = (
  run: RunEnvelope<{ nodeCount: number; pathCount: number }>,
  nodes: readonly string[],
  events: readonly RuntimeEvent[],
): AdapterRunReport => {
  const frames = nodes.map((node) => makeFrame('node:finish', { node, route: run.context.phase }));
  return {
    busId: withBusId(),
    runName: run.name,
    startedAt: run.startedAt,
    endedAt: withClock(),
    frames,
    pluginEvents: events,
  };
};

export const makeDiagnosticNode = (label: string) =>
  createNode({
    kind: 'observe',
    phase: 'verify',
    namespace: 'diagnostic',
    name: label,
    tags: ['diagnostic', 'recovery'],
    run: async (input: { value: number }) => ({
      result: `${input.value}:${label}`,
    }),
  });

export const demoGraph = defaultWorkflowSeed();

const probeMetric = (nodes: readonly WorkflowNode[]): number =>
  chain(nodes)
    .map((node) => collectProbeMap([node]).length)
    .toArray()
    .reduce((next, count) => next + count, 0);

void probeMetric;
