import { withBrand } from '@shared/core';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  defaultTopology,
  parseTopology,
  type MeshNodeContract,
  type MeshPayloadFor,
  type MeshSignalKind,
  type MeshTopology,
} from '@domain/recovery-ops-mesh';
import {
  type EngineEnvelope,
  run,
  runWithQueue,
  type MeshRuntimeCommand,
  type MeshRuntimeCommand as RuntimeCommandLike,
} from '@service/recovery-ops-mesh-engine';

export interface MeshWorkspaceState {
  readonly topology: MeshTopology;
  readonly selectedKind: MeshSignalKind;
  readonly lastSignal: MeshPayloadFor<MeshSignalKind>;
  readonly lastResponse: EngineEnvelope<MeshPayloadFor<MeshSignalKind>> | undefined;
  readonly running: boolean;
  readonly queue: readonly RuntimeCommandLike[];
}

interface WorkspaceInput {
  readonly planId: string;
  readonly initialKind?: MeshSignalKind;
}

const runCommandSchema = z.object({
  planId: z.string(),
  kind: z.enum(['pulse', 'snapshot', 'alert', 'telemetry']),
  value: z.number(),
});

const bootstrapTopology = parseTopology({
  ...defaultTopology,
  id: 'default-mesh',
  nodes: [],
  links: [],
  createdAt: Date.now(),
  version: '1.0.0',
  name: 'default-mesh',
});

export const useMeshEngineWorkspace = (input: WorkspaceInput = { planId: 'default-mesh' }) => {
  const [topology, setTopology] = useState<MeshTopology>(bootstrapTopology);
  const [selectedKind, setSelectedKind] = useState<MeshSignalKind>(input.initialKind ?? 'pulse');
  const [lastSignal, setLastSignal] = useState<MeshPayloadFor<MeshSignalKind>>({
    kind: 'pulse',
    payload: { value: 1 },
  });
  const [lastResponse, setLastResponse] = useState<EngineEnvelope<MeshPayloadFor<MeshSignalKind>> | undefined>(undefined);
  const [queue, setQueue] = useState<readonly RuntimeCommandLike[]>([]);
  const [running, setRunning] = useState(false);

  const runId = useMemo(() => withBrand(`run-${Math.random().toString(16).slice(2)}`, 'MeshRunId'), []);

  useEffect(() => {
    void input.planId;
    setTopology((current) => current);
  }, [input.planId]);

  const submit = async (raw: { planId: string; kind: MeshSignalKind; value: number }) => {
    const parsed = runCommandSchema.parse(raw);
    const payload = payloadFor(parsed.kind, parsed.value);
    const command: MeshRuntimeCommand<MeshSignalKind> = {
      id: withBrand(`cmd-${Date.now()}`, `mesh-cmd-${parsed.kind}`),
      topologyId: withBrand(parsed.planId, 'MeshPlanId'),
      sourceNodeId: topology.nodes[0]?.id ?? withBrand(`${parsed.planId}-source`, 'MeshNodeId'),
      signal: payload,
      priority: 'normal',
    };

    setQueue([...queue, command]);

    setRunning(true);
    try {
      const queueId = withBrand(`w-${Date.now()}`, 'engine-run-token');
      const planId = withBrand(parsed.planId, 'MeshPlanId');
      const queued = await runWithQueue(planId, queueId, payload);
      setLastResponse(queued.at(0));

      const single = await run(planId, runId, payload);
      setLastSignal(payloadFor(selectedKind, parsed.value));
      setTopology((current) => ({
        ...current,
        name: `${current.name}-${Date.now()}`,
      }));

      return single;
    } finally {
      setRunning(false);
    }
  };

  const activeNodes = useMemo(
    () => topology.nodes.filter((node) => node.id.length > 0) as readonly MeshNodeContract[],
    [topology],
  );

  return {
    topology,
    selectedKind,
    setSelectedKind,
    lastSignal,
    lastResponse,
    running,
    queue,
    submit,
    runId,
    activeNodes,
    nodeCount: topology.nodes.length,
  };
};

const snapshotTopology = parseTopology({
  id: 'snapshot-default',
  name: 'snapshot-topology',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

const payloadFor = (kind: MeshSignalKind, value: number): MeshPayloadFor<MeshSignalKind> => {
  if (kind === 'pulse') {
    return { kind, payload: { value } };
  }
  if (kind === 'snapshot') {
    return {
      kind,
      payload: {
        ...snapshotTopology,
        id: withBrand(`plan-${value}`, 'MeshPlanId'),
      },
    };
  }
  if (kind === 'alert') {
    return { kind, payload: { severity: 'high', reason: `high-${value}` } };
  }
  return { kind, payload: { metrics: { value, rate: Math.max(0, value) } } };
};
