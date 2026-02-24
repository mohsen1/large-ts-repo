import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  parseTopology,
  type MeshTopology,
  type MeshNodeContract,
  type MeshSignalKind,
} from '@domain/recovery-ops-mesh';
import { describeTopology, getRuntimeStats } from '../services/meshTopologyService';
import { run } from '@service/recovery-ops-mesh-engine';
import { withBrand } from '@shared/core';
import type { MeshPayloadFor, MeshSignalKind as EngineSignalKind } from '@service/recovery-ops-mesh-engine';
import { useMeshSignalStream } from './useMeshSignalStream';

interface RuntimeEvent {
  readonly id: string;
  readonly name: string;
  readonly payload: MeshPayloadFor<MeshSignalKind>;
  readonly at: number;
}

export interface MeshRuntimeState {
  readonly topology: MeshTopology;
  readonly activeMode: string;
  readonly queueDepth: number;
  readonly health: number;
  readonly stats: ReturnType<typeof getRuntimeStats>;
  readonly events: readonly RuntimeEvent[];
  readonly execute: (kind: MeshSignalKind, value: number) => Promise<void>;
  readonly reset: () => void;
}

const defaultTopology = parseTopology({
  id: 'mesh-runtime-default',
  name: 'mesh-runtime',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

const computeMode = (count: number, health: number): string => {
  if (health > 70) {
    return count < 8 ? 'steady' : 'burst';
  }
  if (health > 35) {
    return 'recover';
  }
  return 'noisy';
};

const deriveHealth = (events: readonly RuntimeEvent[]): number => {
  const now = Date.now();
  const noise = events.filter((event) => event.payload.kind === 'alert').length * 3;
  const base = Math.max(0, 100 - noise);
  const latency = events.reduce((acc, event) => {
    return acc + Math.max(0, now - event.at);
  }, 0);
  const weighted = Math.max(0, base - Math.floor(latency / Math.max(1, events.length * 5_000)));
  return Math.max(0, Math.min(100, weighted));
};

const eventToSignal = (kind: MeshSignalKind, value: number): MeshPayloadFor<MeshSignalKind> => {
  if (kind === 'snapshot') {
    return {
      kind,
      payload: parseTopology({
        id: withBrand(`runtime-${value}`, 'MeshPlanId'),
        name: `snapshot-${value}`,
        version: '1.0.0',
        nodes: [],
        links: [],
        createdAt: Date.now(),
      }),
    };
  }

  if (kind === 'alert') {
    return {
      kind,
      payload: {
        severity: value > 7 ? 'critical' : 'low',
        reason: `runtime-${value}`,
      },
    };
  }

  if (kind === 'telemetry') {
    return {
      kind,
      payload: {
        metrics: {
          runtimeValue: value,
          index: value + 1,
        },
      },
    };
  }

  return { kind, payload: { value } };
};

const isTopologyNodeKind = (kind: EngineSignalKind): kind is EngineSignalKind => true;

export const useMeshRuntimeState = (): MeshRuntimeState => {
  const stream = useMeshSignalStream();
  const [events, setEvents] = useState<readonly RuntimeEvent[]>([]);
  const [health, setHealth] = useState(100);

  useEffect(() => {
    const healthValue = deriveHealth(events);
    setHealth(healthValue);
  }, [events]);

  const queueDepth = stream.events.length;
  const stats = useMemo(() => {
    return {
      ...getRuntimeStats(),
      signature: `${getRuntimeStats().signature}:${queueDepth}`,
    };
  }, [queueDepth]);

  const topology = useMemo<MeshTopology>(() => {
    const nodes: readonly MeshNodeContract[] = stream.catalog
      ? stream.catalog.items.map((item, index) => ({
          id: withBrand(`${stream.catalog?.id}-${index}`, 'MeshNodeId'),
          label: `${item.kind}-${index}`,
          kind: 'observer',
          tags: [...item.tags] as readonly string[],
          priority: index % 2 === 0 ? 'high' : 'normal',
          maxConcurrency: normalizeCount(index + 1),
          payload: {
            probes: [item.id],
          },
          schemaVersion: 'v1.0',
        }))
      : defaultTopology.nodes;

    return {
      ...defaultTopology,
      id: stream.catalog?.id ? withBrand(stream.catalog.id, 'MeshPlanId') : defaultTopology.id,
      name: stream.catalog?.namespace ?? defaultTopology.name,
      nodes,
      links: nodes
        .map((node) => [
          {
            id: withBrand(`link-${node.id}`, 'MeshLinkId'),
            from: node.id,
            to: node.id,
            weight: normalizeCount(node.label.length + 1),
            channels: ['mesh-signal:pulse', 'mesh-signal:telemetry'] as const,
            retryLimit: normalizeCount(queueDepth + 1),
          },
        ])
        .flat(),
    };
  }, [stream.catalog, queueDepth]);

  const execute = useCallback(async (kind: MeshSignalKind, value: number) => {
    const payload = eventToSignal(kind, value);
    const output = await run(
      withBrand(stream.catalog?.id ?? topology.id, 'MeshPlanId'),
      withBrand(`runtime-${Date.now()}`, 'MeshRunId'),
      payload,
    );

    setEvents((current) =>
      [
        {
          id: output.id,
          name: `runtime-${kind}`,
          payload,
          at: Date.now(),
        },
        ...current,
      ]
        .slice(0, 24)
        .toSorted((left, right) => right.at - left.at),
    );

    await stream.send(kind, value);
  }, [stream, topology.id]);

  const reset = () => {
    setEvents([]);
    setHealth(100);
  };

  const activeMode = computeMode(events.length, health);

  return {
    topology,
    activeMode,
    queueDepth,
    health,
    stats,
    events,
    execute,
    reset,
  };
};

const normalizeCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  return Math.round(value);
};
