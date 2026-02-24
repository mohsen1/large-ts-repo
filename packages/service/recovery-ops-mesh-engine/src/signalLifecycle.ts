import { fail, ok, type Result } from '@shared/result';
import { normalizeLimit, withBrand } from '@shared/core';
import { createPluginSession } from '@shared/type-level';
import {
  type EngineEnvelope,
  type EnginePlanSummary,
  type EngineWorkItem,
  type MeshEngineAdapter,
  type MeshPayloadFor,
  type MeshRunArtifact,
  type MeshSignalKind,
  type MeshRuntimeCommand,
  type MeshTopology,
} from './types';
import { createSignalBus, summarizeBusTimeline, type BusPlugin, runSignalBus } from './signalBus';
import {
  type FleetAdapter,
  MeshAdapterFleet,
  buildFleetReport,
  createFallbackAdapter,
  executeFleet,
  buildFleet,
} from './adapterFleet';
import { createEngine } from './orchestrator';
import { parseTopology } from '@domain/recovery-ops-mesh';

export type LifecycleState = 'idle' | 'running' | 'error' | 'done';
export type LifecycleSignal<TSignal extends MeshSignalKind = MeshSignalKind> = MeshRuntimeCommand<TSignal>;

export interface LifecycleRecord<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly id: string;
  readonly command: LifecycleSignal<TSignal>;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly state: LifecycleState;
  readonly artifact: MeshRunArtifact | undefined;
  readonly output: EngineEnvelope<MeshPayloadFor<TSignal>> | undefined;
  readonly error: Error | undefined;
}

export interface LifecycleConfig {
  readonly topology: MeshTopology;
  readonly namespace: string;
  readonly plugins: readonly BusPlugin[];
  readonly adapters: readonly MeshEngineAdapter[];
}

export interface LifecycleMetrics {
  readonly issued: number;
  readonly completed: number;
  readonly errored: number;
  readonly queue: number;
}

export const createLifecycleRecord = <TSignal extends MeshSignalKind>(
  command: LifecycleSignal<TSignal>,
): LifecycleRecord<TSignal> => ({
  id: command.id,
  command,
  startedAt: Date.now(),
  state: 'idle',
  artifact: undefined,
  output: undefined,
  error: undefined,
});

export class MeshLifecycleController {
  readonly #topology: MeshTopology;
  readonly #namespace: string;
  readonly #plugins: readonly BusPlugin[];
  readonly #adapterFleet: MeshAdapterFleet;
  readonly #history = new Map<string, LifecycleRecord>();

  constructor(config: LifecycleConfig) {
    this.#topology = config.topology;
    this.#namespace = config.namespace;
    this.#plugins = config.plugins;

    const fallbacks = config.topology.nodes
      .map((node, index) => createFallbackAdapter('pulse', `${node.kind}-${index}`))
      .map((adapter) => adapter as FleetAdapter<MeshSignalKind>);

    this.#adapterFleet = buildFleet(fallbacks, {
      name: `${config.namespace}:lifecycle`,
      limit: normalizeLimit(config.adapters.length + fallbacks.length),
    });

    for (const adapter of config.adapters) {
      this.#adapterFleet.add({
        adapter,
        alias: adapter.adapterId,
        affinity: adapter.capabilities,
        mode: 'warm',
        active: true,
      } as FleetAdapter<MeshSignalKind>);
    }
  }

  async execute<TSignal extends MeshSignalKind>(
    command: MeshRuntimeCommand<TSignal>,
  ): Promise<Result<LifecycleRecord<TSignal>, Error>> {
    const record = createLifecycleRecord(command);
    this.#history.set(command.id, record);

    const topologyEngine = createEngine(this.#topology);
    const activePlugins = this.#plugins.filter((plugin) => plugin.supports.includes(command.signal.kind));

    if (activePlugins.length === 0) {
      const fallbackRun = await topologyEngine.execute({
        topologyId: this.#topology.id,
        runId: withBrand(command.id, 'MeshRunId'),
        plan: this.#topology,
        signal: command.signal,
        options: {
          priority: command.priority,
          requireHistory: false,
        },
      });

      if (!fallbackRun.ok) {
        return fail(fallbackRun.error);
      }

      const completed: LifecycleRecord<TSignal> = {
        ...record,
        state: 'done',
        artifact: {
          runId: fallbackRun.value.runId,
          adapter: fallbackRun.value.source,
          startedAt: fallbackRun.value.emittedAt,
          state: 'done',
          emitted: 1,
          errors: 0,
        },
        output: fallbackRun.value as EngineEnvelope<MeshPayloadFor<TSignal>>, 
        finishedAt: Date.now(),
      };

      this.#history.set(command.id, completed as LifecycleRecord);
      return ok(completed);
    }

    const busSession = createPluginSession([], {
      name: `${this.#namespace}-lifecycle`,
      capacity: normalizeLimit(16),
    });
    using _busSession = busSession;
    void _busSession;

    try {
      const busOutputs = await runSignalBus(
        this.#topology,
        command,
        this.#plugins as readonly BusPlugin<TSignal>[],
      );
      const first = busOutputs.at(0);
      if (!first) {
        throw new Error('bus produced no output');
      }

      const fleetResult = await executeFleet(this.#adapterFleet, command);
      const completed: LifecycleRecord<TSignal> = {
        ...record,
        state: 'done',
        artifact: {
          runId: withBrand(`run-${command.id}`, 'MeshRunId'),
          adapter: this.#adapterFleet.inspect().total > 0
            ? withBrand('mesh-lifecycle-fleet', 'engine-adapter-id')
            : withBrand('fallback', 'engine-adapter-id'),
          startedAt: record.startedAt,
          state: 'done',
          emitted: first.payload.kind.length + fleetResult.length,
          errors: 0,
        },
        output: first,
        finishedAt: Date.now(),
      };
      this.#history.set(command.id, completed as LifecycleRecord);
      return ok(completed);
    } catch (error) {
      const failed: LifecycleRecord<TSignal> = {
        ...record,
        state: 'error',
        artifact: undefined,
        output: undefined,
        finishedAt: Date.now(),
        error: error instanceof Error ? error : new Error('lifecycle failed'),
      };
      this.#history.set(command.id, failed as LifecycleRecord);
      const failure = failed.error ?? new Error('lifecycle failed');
      return fail(failure);
    }
  }

  list = (): readonly LifecycleRecord[] =>
    Array.from(this.#history.values()).toSorted((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0));

  metrics = (): LifecycleMetrics => {
    const issued = this.#history.size;
    const completed = Array.from(this.#history.values()).filter((record) => record.state === 'done').length;
    const errored = Array.from(this.#history.values()).filter((record) => record.state === 'error').length;
    const queue = this.#plugins.length;
    return { issued, completed, errored, queue };
  };

  async summary(): Promise<EnginePlanSummary[]> {
    type MutableSummary = {
      planId: MeshTopology['id'];
      queued: number;
      queuedKinds: Record<MeshSignalKind, number>;
      topNodes: readonly MeshTopology['nodes'][number]['id'][];
    };

    const grouped = new Map<MeshTopology['id'], MutableSummary>();

    for (const item of this.#history.values()) {
      const current = grouped.get(this.#topology.id);
      if (!current) {
        const empty = {
          planId: this.#topology.id,
          queued: 0,
          queuedKinds: {
            pulse: 0,
            snapshot: 0,
            alert: 0,
            telemetry: 0,
          },
          topNodes: this.#topology.nodes.map((node) => node.id),
        };
        grouped.set(this.#topology.id, empty);
        const queuedKinds = {
          ...empty.queuedKinds,
          [item.command.signal.kind]: (empty.queuedKinds[item.command.signal.kind] ?? 0) + 1,
        };
        grouped.set(this.#topology.id, {
          ...empty,
          queued: 1,
          queuedKinds,
        });
      } else {
        grouped.set(this.#topology.id, {
          ...current,
          queued: current.queued + 1,
          queuedKinds: {
            ...current.queuedKinds,
            [item.command.signal.kind]: (current.queuedKinds[item.command.signal.kind] ?? 0) + 1,
          },
        });
      }
    }

    const out: EnginePlanSummary[] = [];
    for (const item of grouped.values()) {
      out.push(item as EnginePlanSummary);
    }

    return out;
  }

  timeline = async (command: EngineWorkItem, plan: readonly MeshRuntimeCommand[]): Promise<string> => {
    const topologyRun = plan[0];
    if (!topologyRun) {
      return 'noop';
    }

    const timeline = await summarizeBusTimeline(this.#topology, topologyRun);
    const line = buildFleetReport(
      this.#adapterFleet,
      this.#topology.id,
      topologyRun.signal.kind ? [topologyRun.signal.kind] : ['pulse'],
    );
    return `${timeline}:${line}:${command.id}:${command.deadlineAt}`;
  };
}

export const createLifecycleController = <TTopology extends MeshTopology>(
  topology: NoInfer<TTopology>,
  namespace: string,
  plugins: readonly BusPlugin[] = [],
): MeshLifecycleController => {
  return new MeshLifecycleController({
    topology,
    namespace,
    plugins,
    adapters: [],
  });
};

export const buildLifecycleSignal = <TSignal extends MeshSignalKind>(
  topologyId: string,
  runId: string,
  kind: TSignal,
  value: number,
): MeshRuntimeCommand<TSignal> => {
  const payload = buildLifecyclePayload(kind, value);
  return {
    id: withBrand(runId, `mesh-cmd-${kind}`),
    topologyId: withBrand(topologyId, 'MeshPlanId'),
    sourceNodeId: withBrand(topologyId, 'MeshNodeId'),
    signal: payload,
    priority: 'normal',
  };
};

const buildLifecyclePayload = <TSignal extends MeshSignalKind>(
  kind: TSignal,
  value: number,
): MeshPayloadFor<TSignal> => {
  if (kind === 'snapshot') {
    const payload = parseTopology({
      id: withBrand(`snapshot-${value}`, 'MeshPlanId'),
      name: `snapshot-${value}`,
      version: '1.0.0',
      nodes: [],
      links: [],
      createdAt: Date.now(),
    });
    return {
      kind: 'snapshot',
      payload,
    } as MeshPayloadFor<'snapshot'> as MeshPayloadFor<TSignal>;
  }

  if (kind === 'alert') {
    return {
      kind: 'alert',
      payload: {
        severity: value > 5 ? 'critical' : 'high',
        reason: `lifecycle-${kind}-${value}`,
      },
    } as MeshPayloadFor<'alert'> as MeshPayloadFor<TSignal>;
  }

  if (kind === 'telemetry') {
    return {
      kind,
      payload: {
        metrics: {
          telemetryValue: value,
        },
      },
    } as MeshPayloadFor<'telemetry'> as MeshPayloadFor<TSignal>;
  }

  return {
    kind: 'pulse',
    payload: {
      value,
    },
  } as MeshPayloadFor<'pulse'> as MeshPayloadFor<TSignal>;
};
