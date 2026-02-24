import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import { createPluginSession } from '@shared/type-level';
import { defaultTopology, parseTopology } from '@domain/recovery-ops-mesh';
import { createEngine, buildQueue, runPlan, runQueue } from './orchestrator';
import { ConsoleAdapter, TimedAdapter } from './adapter';
import {
  type EngineEnvelope,
  type EngineRunToken,
  type MeshPlanId,
  type MeshPayloadFor,
  type MeshRuntimeCommand,
  type MeshRunId,
  type MeshSignalKind,
  type MeshTopology,
  type MeshRunRequest,
} from './types';

export * from './types';
export * from './adapter';
export * from './orchestrator';
export * from './signalBus';
export * from './adapterFleet';
export * from './signalLifecycle';

interface RuntimeBootstrap {
  readonly session: ReturnType<typeof createPluginSession>;
  readonly startedAt: number;
  readonly hostId: string;
}

let bootstrapCache: Promise<RuntimeBootstrap> | undefined;

const bootstrapRuntime = async (): Promise<RuntimeBootstrap> => {
  const session = createPluginSession([], { name: 'recovery-ops-mesh', capacity: 64 });
  const runtimeTopology = parseTopology({
    ...defaultTopology,
    id: withBrand('boot-plan', 'MeshPlanId'),
    name: 'boot topology',
    version: '1.0.0',
    nodes: [],
    links: [],
    createdAt: Date.now(),
  });

  const bootAdapters = [
    new ConsoleAdapter('boot', ['pulse', 'snapshot', 'alert', 'telemetry']),
    new TimedAdapter(['pulse', 'snapshot', 'alert', 'telemetry']),
  ];
  createEngine(runtimeTopology, bootAdapters);

  return {
    session,
    startedAt: Date.now(),
    hostId: `runtime-${randomUUID()}`,
  };
};

export const getDefaultEngineRuntime = async (): Promise<RuntimeBootstrap> => {
  if (!bootstrapCache) {
    bootstrapCache = bootstrapRuntime();
  }
  return bootstrapCache;
};

const assertTopology = (topologyId: MeshPlanId): MeshTopology => ({
  ...defaultTopology,
  id: topologyId,
  name: `runtime-${topologyId}`,
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

export const run = async (
  topologyId: MeshPlanId,
  runId: MeshRunId,
  signal: MeshPayloadFor<MeshSignalKind>,
): Promise<EngineEnvelope<MeshPayloadFor<MeshSignalKind>>> => {
  await getDefaultEngineRuntime();

  const request: MeshRunRequest = {
    topologyId,
    runId,
    plan: assertTopology(topologyId),
    signal,
  };

  const result = await runPlan(request);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};

export const runWithQueue = async (
  topologyId: MeshPlanId,
  commandId: EngineRunToken,
  signal: MeshPayloadFor<MeshSignalKind>,
): Promise<readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[]> => {
  const topology = assertTopology(topologyId);
  const command: MeshRuntimeCommand<MeshSignalKind> = {
    id: withBrand(`${commandId}`, 'mesh-cmd-pulse'),
    topologyId,
    sourceNodeId: topology.nodes[0]?.id ?? withBrand(`${topologyId}-source`, 'MeshNodeId'),
    signal,
    priority: 'normal',
  };

  const queue = buildQueue(topology, command, ['low', 'normal', 'high', 'critical']);
  const result = await runQueue(topology, queue);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};

export const defaultEngineRuntime = getDefaultEngineRuntime();
