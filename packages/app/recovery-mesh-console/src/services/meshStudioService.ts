import { z } from 'zod';
import { withBrand } from '@shared/core';
import {
  run,
  runWithQueue,
  orchestrate,
  type EngineEnvelope,
  type MeshPayloadFor,
  type MeshSignalKind,
} from '@service/recovery-ops-mesh-engine';
import { parseTopology } from '@domain/recovery-ops-mesh';
import { parseOrThrowSignal, meshRuntimeConfig } from '@domain/recovery-ops-mesh';
import {
  runRequestSchema,
  type MeshConsoleConfig,
  summarizeConsoleConfig,
} from '../types/meshConsoleTypes';

const queuedTopology = parseTopology({
  id: 'service-plan',
  name: 'service-topology',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

const requestSchema = z.object({
  signal: z.object({
    kind: z.enum(['pulse', 'snapshot', 'alert', 'telemetry']),
    payload: z.record(z.unknown()),
  }),
  runId: z.string(),
  planId: z.string(),
});

export const meshServiceConfig = summarizeConsoleConfig({
  namespace: 'mesh.console',
  enabled: true,
  maxBatch: 16,
  sampleRate: 1,
});

export const executePulse = async (planId: string, runId: string, value: number) => {
  const parsed = requestSchema.parse({
    signal: { kind: 'pulse', payload: { value } },
    runId,
    planId,
  });

  const signal = parseOrThrowSignal(parsed.signal.kind as MeshSignalKind, parsed.signal.payload);
  return run(withBrand(parsed.planId, 'MeshPlanId'), withBrand(parsed.runId, 'MeshRunId'), signal);
};

export const executeQueue = async (planId: string, runId: string, signal: MeshPayloadFor<MeshSignalKind>) => {
  const commandId = withBrand(`${runId}-${Date.now()}`, 'engine-run-token');
  return runWithQueue(withBrand(planId, 'MeshPlanId'), commandId, signal);
};

export const executeOrchestrate = async (topology: Parameters<typeof parseTopology>[0]) => {
  const parsedTopology = parseTopology(topology);
  const sorted = parsedTopology.nodes.map((node) => node.id).sort();
  const prepared = runRequestSchema.parse({
    kind: 'telemetry',
    value: sorted.length,
    runId: 'orchestrate',
    planId: parsedTopology.id,
  });

  return orchestrate(
    {
      ...queuedTopology,
      id: parsedTopology.id,
      nodes: parsedTopology.nodes,
      links: parsedTopology.links,
      name: `${parsedTopology.name}-orchestrated`,
      version: parsedTopology.version,
      createdAt: parsedTopology.createdAt,
    },
    {
      id: withBrand(prepared.runId, 'mesh-cmd-telemetry'),
      topologyId: parsedTopology.id,
      sourceNodeId: parsedTopology.nodes[0]?.id ?? withBrand(`${parsedTopology.id}-source`, 'MeshNodeId'),
      signal: {
        kind: 'telemetry',
        payload: {
          metrics: {
            metrics: prepared.value,
            queued: meshServiceConfig.maxBatch,
          },
        },
      },
      priority: 'critical',
    },
  );
};

export const readServiceConfig = (): MeshConsoleConfig => meshServiceConfig;

export const validateRuntimePayload = (input: unknown): EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[] => {
  const parsed = requestSchema.parse(input as never);
  const payload =
    parsed.signal.kind === 'pulse'
      ? parseOrThrowSignal('pulse', { value: parsed.signal.payload.value ?? 0 })
      : parsed.signal.kind === 'alert'
        ? parseOrThrowSignal('alert', {
          severity: parsed.signal.payload.severity ?? 'low',
          reason: String(parsed.signal.payload.reason ?? 'alert'),
        })
        : parsed.signal.kind === 'snapshot'
          ? parseOrThrowSignal('snapshot', queuedTopology)
          : parseOrThrowSignal('telemetry', {
            metrics: {
              value: Number((parsed.signal.payload as { value?: unknown }).value ?? 0),
            },
          });

  const result: EngineEnvelope<MeshPayloadFor<MeshSignalKind>> = {
    id: withBrand(`env-${parsed.runId}`, 'mesh-engine-envelope'),
    payload,
    emittedAt: Date.now(),
    runId: withBrand(parsed.runId, 'MeshRunId'),
    source: withBrand(`svc-${parsed.runId}`, 'engine-adapter-id'),
  };

  return [result];
};

export async function collectServiceMetrics(): Promise<readonly MeshPayloadFor<MeshSignalKind>[]> {
  const signals: MeshPayloadFor<MeshSignalKind>[] = [
    { kind: 'telemetry', payload: { metrics: { namespace: 1 } } },
    { kind: 'pulse', payload: { value: 1 } },
    { kind: 'alert', payload: { severity: 'low', reason: meshRuntimeConfig.namespace } },
    { kind: 'snapshot', payload: queuedTopology },
  ];

  const responses = await Promise.all(
    signals.map((signal) => executeQueue('service', `service-${Math.random()}`, signal)),
  );
  return responses.flat().map((response) => response.payload);
}
