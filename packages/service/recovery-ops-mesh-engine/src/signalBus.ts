import { randomUUID } from 'node:crypto';
import { withBrand, normalizeLimit } from '@shared/core';
import { createPluginSession, NoInfer } from '@shared/type-level';
import {
  type EngineEnvelope,
  type MeshPayloadFor,
  type MeshRuntimeCommand,
  type MeshSignalKind,
  type MeshTimelineEvent,
  type MeshExecutionContext,
  type MeshTopology,
  type MeshRunId,
  type EngineRunToken,
} from './types';
import { createTimelineBuilder } from './adapter';

export type BusName<T extends string = string> = `mesh-bus:${T}`;
export type BusRegistryId = string & { readonly __brand: 'MeshBusRegistryId' };

type BusEventState = 'queued' | 'delivered' | 'dropped' | 'failed';

export interface BusEvent<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly id: EngineRunToken;
  readonly commandId: string;
  readonly bus: BusName;
  readonly signal: TSignal;
  readonly payload: MeshPayloadFor<TSignal>;
  readonly emittedAt: number;
  readonly state: BusEventState;
}

export interface BusStats {
  readonly queued: number;
  readonly delivered: number;
  readonly failed: number;
  readonly averageLatencyMs: number;
}

export interface BusPlugin<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly name: BusName;
  readonly supports: readonly TSignal[];
  canProcess(signal: TSignal, context: MeshExecutionContext): boolean;
  process(command: MeshRuntimeCommand<TSignal>, context: MeshExecutionContext): Promise<MeshPayloadFor<TSignal>[]>;
}

const toTimeline = (runtime: MeshExecutionContext, events: readonly MeshTimelineEvent[]): string =>
  events
    .map((item) => `${item.nodeId}:${item.kind}:${item.at}`)
    .join('|')
    .slice(0, 120);

export class MeshSignalBus<TTopology extends MeshTopology> {
  readonly #topology: TTopology;
  readonly #name: BusName;
  readonly #plugins = new Map<BusRegistryId, BusPlugin>();
  readonly #events: BusEvent[] = [];
  readonly #history: MeshTimelineEvent[] = [];
  #queued = 0;
  #delivered = 0;
  #failed = 0;

  constructor(topology: NoInfer<TTopology>, name: BusName) {
    this.#topology = topology;
    this.#name = name;
  }

  get id() {
    return this.#name as BusName;
  }

  pluginCount = (): number => this.#plugins.size;

  register = <TSignal extends MeshSignalKind>(plugin: BusPlugin<TSignal>): BusRegistryId => {
    const id = withBrand(`${this.#name}:${plugin.name}-${randomUUID()}`, 'MeshBusRegistryId');
    this.#plugins.set(id, plugin as BusPlugin);
    return id;
  };

  unregister = (id: BusRegistryId): void => {
    this.#plugins.delete(id);
  };

  queue = async <TSignal extends MeshSignalKind>(
    command: MeshRuntimeCommand<TSignal>,
    context: MeshExecutionContext,
  ): Promise<EngineEnvelope<MeshPayloadFor<TSignal>>[]> => {
    this.#queued += 1;
    const envelope = this.makeBusEvent(command);

    const candidates = Array.from(this.#plugins.values()).filter(
      (plugin) =>
        plugin.supports.includes(command.signal.kind) && plugin.canProcess(command.signal.kind, context),
    ) as BusPlugin<TSignal>[];

    if (candidates.length === 0) {
      this.#failed += 1;
      return [
        {
          id: withBrand(`bus-${randomUUID()}`, 'mesh-engine-envelope'),
          payload: command.signal,
          emittedAt: Date.now(),
          runId: context.runId,
          source: withBrand(`${this.#name}-fallback`, 'engine-adapter-id'),
        },
      ];
    }

    const outputs = await Promise.all(
      candidates.map(async (plugin) => {
        try {
          const results = await plugin.process(command, context);
          this.#delivered += 1;
          return results as MeshPayloadFor<TSignal>[];
        } catch {
          this.#failed += 1;
          return [];
        }
      }),
    );

    const emitted = {
      ...envelope,
      state: 'delivered' as BusEventState,
    };
    this.#events.push(emitted);

    return outputs
      .flat()
      .map((payload) => ({
        id: withBrand(`bus-${randomUUID()}`, 'mesh-engine-envelope'),
        payload,
        emittedAt: Date.now(),
        runId: context.runId,
        source: withBrand(this.#name, 'engine-adapter-id'),
      }));
  };

  stats = (): BusStats => ({
    queued: this.#queued,
    delivered: this.#delivered,
    failed: this.#failed,
    averageLatencyMs: this.#events.length === 0 ? 0 : Math.round(this.#history.length / this.#events.length),
  });

  snapshot = (): readonly BusEvent[] => this.#events.toSorted((left, right) => right.emittedAt - left.emittedAt);

  timeline = (runId: MeshRunId): readonly MeshTimelineEvent[] => {
    const builder = createTimelineBuilder();
    const context: MeshExecutionContext = {
      token: withBrand(`context-${runId}`, 'engine-run-token'),
      runId,
      startedAt: Date.now(),
      nodes: this.#topology.nodes,
    };

    for (const node of this.#topology.nodes) {
      builder.push({
        eventId: withBrand(`${runId}-${node.id}`, 'mesh-timeline-event'),
        at: Date.now(),
        nodeId: node.id,
        kind: 'telemetry',
        payload: {
          metrics: {
            queued: this.#queued,
            delivered: this.#delivered,
          },
        },
      });
      this.#history.push({
        eventId: withBrand(`${runId}-${node.id}`, 'mesh-timeline-event'),
        at: Date.now() + normalizeLimit(3),
        nodeId: node.id,
        kind: 'telemetry',
        payload: {
          metrics: {
            queued: this.#queued,
            delivered: Number(context.token.length),
          },
        },
      });
    }

    return this.#history.toSorted((left, right) => right.at - left.at);
  };

  summarize = (): string => {
    const topologyId = this.#topology.id;
    const timeline = this.timeline(withBrand(`${topologyId}`, 'MeshRunId'));
    return [
      this.#name,
      `${this.#events.length}`,
      `${this.#topology.nodes.length}`,
      `${timeline.length}`,
      toTimeline({ token: withBrand('none', 'engine-run-token'), runId: withBrand('none', 'MeshRunId'), startedAt: Date.now(), nodes: [] }, timeline),
    ].join('|');
  };

  private makeBusEvent = (command: MeshRuntimeCommand<MeshSignalKind>): BusEvent<MeshSignalKind> => ({
    id: withBrand(`evt-${Date.now()}-${randomUUID()}`, 'engine-run-token'),
    commandId: command.id,
    bus: this.#name,
    signal: command.signal.kind,
    payload: command.signal,
    emittedAt: Date.now(),
    state: 'queued',
  });

  [Symbol.asyncDispose] = async () => {
    this.#events.length = 0;
    this.#history.length = 0;
    this.#plugins.clear();
    this.#queued = 0;
    this.#delivered = 0;
    this.#failed = 0;
  };
}

export interface SignalBusConfig {
  readonly namespace: string;
  readonly topology: MeshTopology;
  readonly pluginCapacity?: number;
}

export const createSignalBus = (config: SignalBusConfig): MeshSignalBus<MeshTopology> => {
  const bus = new MeshSignalBus(config.topology, `mesh-bus:${config.namespace}` as BusName);
  return bus;
};

export const runSignalBus = async <TSignal extends MeshSignalKind>(
  topology: MeshTopology,
  command: MeshRuntimeCommand<TSignal>,
  plugins: readonly BusPlugin<TSignal>[],
): Promise<EngineEnvelope<MeshPayloadFor<TSignal>>[]> => {
  const runtimeContext: MeshExecutionContext = {
    token: withBrand(`bus:${command.id}`, 'engine-run-token'),
    runId: withBrand(command.id, 'MeshRunId'),
    startedAt: Date.now(),
    nodes: topology.nodes,
  };

  const bus = createSignalBus({ namespace: topology.id, topology, pluginCapacity: 32 });

  const session = createPluginSession([], { name: 'bus-session', capacity: normalizeLimit(16) });
  using _session = session;

  for (const plugin of plugins) {
    bus.register(plugin);
  }

  return bus.queue(command, runtimeContext);
};

export const summarizeBusTimeline = async (
  topology: MeshTopology,
  command: MeshRuntimeCommand<MeshSignalKind>,
): Promise<string> => {
  const bus = createSignalBus({ namespace: topology.id, topology, pluginCapacity: 16 });
  const trace = bus.timeline(withBrand(command.id, 'MeshRunId'));
  return `${topology.id}:${trace.length}:${trace.at(0)?.at ?? 0}`;
};
