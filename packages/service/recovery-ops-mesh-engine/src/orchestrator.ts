import { withBrand } from '@shared/core';
import { createPluginSession, runPipeline } from '@shared/type-level';
import { fail, ok, type Result } from '@shared/result';
import { createNavigator } from '@domain/recovery-ops-mesh';
import { randomUUID } from 'node:crypto';
import { ConsoleAdapter, TimedAdapter, createTimelineBuilder, runWithDisposables } from './adapter';
import {
  type EngineEnvelope,
  type EnginePlanSummary,
  type EngineReport,
  type EngineRunToken,
  type EngineWorkItem,
  MeshExecutionContext,
  MeshPayloadFor,
  type MeshEngineAdapter,
  type MeshEngineState,
  type MeshPlanId,
  type MeshRunId,
  type MeshRuntimeCommand,
  MeshSignalKind,
  type MeshTimelineEvent,
  type MeshTopology,
  type MeshRunRequest,
} from './types';

const runAdapterPipeline = async <TSignal extends MeshSignalKind>(
  adapters: readonly MeshEngineAdapter[],
  command: MeshRuntimeCommand<TSignal>,
): Promise<MeshPayloadFor<TSignal>[]> => {
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      if (!adapter.capabilities.includes(command.signal.kind)) {
        return [] as MeshPayloadFor<TSignal>[];
      }
      return adapter.execute(command);
    }),
  );

  return results.flat();
};

const buildRuntimeCommand = (request: MeshRunRequest): MeshRuntimeCommand<MeshSignalKind> => {
  const sourceNodeId = request.plan.nodes[0]?.id ?? withBrand(`${request.topologyId}-source`, 'MeshNodeId');
  return {
    id: withBrand(`cmd-${request.runId}`, 'mesh-cmd-pulse'),
    topologyId: request.topologyId,
    sourceNodeId,
    signal: request.signal,
    priority: request.options?.priority ?? 'normal',
  };
};

class InternalMeshEngineRuntime {
  #state: MeshEngineState = {
    active: 0,
    queued: 0,
    completed: 0,
    failed: 0,
  };

  #timeline: Array<{ kind: MeshSignalKind; at: number; path: string; source: string }> = [];
  #startedAt = Date.now();

  constructor(
    private readonly topology: MeshTopology,
    private readonly adapters: readonly MeshEngineAdapter[],
  ) {}

  get state() {
    return { ...this.#state };
  }

  async execute(
    request: MeshRunRequest,
  ): Promise<Result<EngineEnvelope<MeshPayloadFor<MeshSignalKind>>, Error>> {
    this.#state.active += 1;
    this.#state.queued += 1;

    const runToken = withBrand(request.runId, 'engine-run-token');
    const command = buildRuntimeCommand(request);

    const outputsResult = await runWithDisposables(runToken, this.adapters, async (connected) =>
      runAdapterPipeline(connected, command),
    );

    if (!outputsResult.ok) {
      this.#state.failed += 1;
      this.#state.active = Math.max(this.#state.active - 1, 0);
      this.#state.queued = Math.max(this.#state.queued - 1, 0);
      return fail(outputsResult.error);
    }

    const first = outputsResult.value.at(0);
    if (!first) {
      this.#state.failed += 1;
      this.#state.active = Math.max(this.#state.active - 1, 0);
      this.#state.queued = Math.max(this.#state.queued - 1, 0);
      return fail(new Error('no output from adapters'));
    }

    const navigator = createNavigator(this.topology.nodes);
    const hasPath = navigator.toNode(this.topology.nodes[0]?.id ?? withBrand(`${this.topology.id}-fallback`, 'MeshNodeId'));

    const builder = createTimelineBuilder();
    for (const [index, node] of this.topology.nodes.entries()) {
      const sourceNode = hasPath?.id ?? node.id;
      const event: MeshTimelineEvent = {
        eventId: withBrand(`${request.runId}-${index}`, 'mesh-timeline-event'),
        at: request.runId.length + index,
        nodeId: sourceNode,
        kind: request.signal.kind,
        payload: request.signal.payload,
      };

      builder.push(event);
      this.#timeline.push({
        kind: event.kind,
        at: event.at,
        path: event.nodeId,
        source: request.runId,
      });
    }

    this.#state.active = Math.max(this.#state.active - 1, 0);
    this.#state.queued = Math.max(this.#state.queued - 1, 0);
    this.#state.completed += 1;

    const timelineSize = builder.entries().length;
    if (timelineSize === 0) {
      return fail(new Error('timeline empty'));
    }

    const output: EngineEnvelope<MeshPayloadFor<MeshSignalKind>> = {
      id: withBrand(`env-${randomUUID()}`, 'mesh-engine-envelope'),
      payload: first,
      emittedAt: Date.now(),
      runId: request.runId,
      source: this.adapters[0]?.adapterId,
    };

    return ok(output);
  }

  summarize(planId: MeshPlanId): EnginePlanSummary {
    const byKind: Record<MeshSignalKind, number> = {
      pulse: 0,
      snapshot: 0,
      alert: 0,
      telemetry: 0,
    };

    for (const event of this.#timeline) {
      byKind[event.kind] += 1;
    }

    return {
      planId,
      queued: this.#state.queued,
      queuedKinds: byKind,
      topNodes: this.topology.nodes.map((node) => node.id),
    };
  }

  async report(runId: MeshRunId): Promise<EngineReport> {
    return {
      run: {
        runId,
        adapter: this.adapters[0]?.adapterId,
        startedAt: this.#startedAt,
        state: this.#state.failed > 0 ? 'error' : this.#state.active > 0 ? 'executing' : 'done',
        emitted: this.#timeline.length,
        errors: this.#state.failed,
      },
      context: {
        token: withBrand(`token-${runId}`, 'engine-run-token'),
        runId,
        startedAt: this.#startedAt,
        nodes: this.topology.nodes,
      },
      chunkCount: this.#timeline.length,
    };
  }
}

export const createEngine = (
  topology: MeshTopology,
  adapters: readonly MeshEngineAdapter[] = [],
): MeshEngineRuntime => {
  return new InternalMeshEngineRuntime(
    topology,
    adapters.length > 0
      ? adapters
      : [
          new ConsoleAdapter('boot', ['pulse', 'snapshot', 'alert', 'telemetry']),
          new TimedAdapter(['pulse', 'snapshot', 'alert', 'telemetry']),
        ],
  );
};

export const runPlan = async (
  request: MeshRunRequest,
  adapters: readonly MeshEngineAdapter[] = [],
): Promise<Result<EngineEnvelope<MeshPayloadFor<MeshSignalKind>>, Error>> => {
  const runtime = createEngine(request.plan, adapters);
  const session = createPluginSession([], { name: 'runPlan', capacity: 16 });
  using _session = session;
  void _session;
  return runtime.execute(request);
};

export const buildQueue = (
  topology: MeshTopology,
  command: MeshRuntimeCommand<MeshSignalKind>,
  priorities: readonly ['low', 'normal', 'high', 'critical'] = ['low', 'normal', 'high', 'critical'],
): readonly EngineWorkItem[] => {
  const items = priorities.map((priority, index): EngineWorkItem => {
    const queuedCommand = {
      ...command,
      id: `${command.id}-${priority}-${index}` as MeshRuntimeCommand<MeshSignalKind>['id'],
      priority,
    } as MeshRuntimeCommand<MeshSignalKind>;

    return {
      id: withBrand(`work-${topology.id}-${index}-${randomUUID()}`, 'engine-run-token'),
      command: queuedCommand,
      deadlineAt: Date.now() + index * 1000,
    };
  });

  return items;
};

export const runQueue = async (
  topology: MeshTopology,
  queue: readonly EngineWorkItem[],
): Promise<Result<readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[], Error>> => {
  const runtime = createEngine(topology);
  const outputs = await Promise.all(
    queue.map((item) =>
      runtime.execute({
        topologyId: topology.id,
        runId: withBrand(item.id, 'MeshRunId'),
        plan: topology,
        signal: item.command.signal,
        options: {
          priority: item.command.priority,
          requireHistory: false,
        },
      }),
    ),
  );

  const successful = outputs.filter(
    (output): output is { ok: true; value: EngineEnvelope<MeshPayloadFor<MeshSignalKind>> } => output.ok,
  );

  if (successful.length === 0) {
    return fail(new Error('queue produced no successful outputs'));
  }

  const mapped = await runPipeline<typeof successful, EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[]>(
    'mesh-queue',
    [
      async (seed: typeof successful) =>
        seed.reduce<EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[]>(
          (acc, item) => {
            acc.push(item.value);
            return acc;
          },
          [],
        ),
    ],
    successful,
  );

  return ok(mapped);
};

export const orchestrate = async (
  topology: MeshTopology,
  command: MeshRuntimeCommand<MeshSignalKind>,
): Promise<Result<readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[], Error>> => {
  const queue = buildQueue(topology, command);
  return runQueue(topology, queue);
};

export type MeshEngineRuntime = InstanceType<typeof InternalMeshEngineRuntime>;
