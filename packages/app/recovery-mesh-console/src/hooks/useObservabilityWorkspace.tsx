import { useCallback, useMemo, useRef, useState } from 'react';
import { withBrand } from '@shared/core';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';
import { parseTopology } from '@domain/recovery-ops-mesh';
import { analyzeTopology, type ObservabilityAlert } from '@service/recovery-ops-mesh-observability-orchestrator';
import {
  collectSignals,
  InMemoryObservabilityStore,
  isAlertRecord,
  type ObservabilityEventRecord,
} from '@data/recovery-ops-mesh-observability-store';

interface WorkspaceSeed {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly topology: MeshTopology;
}

export interface ObservabilityWorkspaceState {
  readonly events: readonly ObservabilityEventRecord[];
  readonly history: readonly string[];
  readonly alerts: readonly ObservabilityAlert[];
  readonly topology: MeshTopology;
  readonly loading: boolean;
  readonly run: () => Promise<void>;
  readonly runForKind: (kind: MeshSignalKind, value: number) => Promise<void>;
  readonly reset: () => void;
}

type SignalSeed = readonly [
  MeshSignalKind,
  number,
];

const signalSeeds: readonly SignalSeed[] = [
  ['pulse', 1],
  ['snapshot', 2],
  ['telemetry', 3],
  ['alert', 4],
];

const toSignalPayload = (seed: number, kind: MeshSignalKind, topologyId: string): MeshPayloadFor<MeshSignalKind> => {
  if (kind === 'snapshot') {
    return {
      kind,
      payload: parseTopology({
        id: withBrand(`snapshot-${topologyId}-${seed}`, 'MeshPlanId'),
        name: `snapshot-${seed}`,
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
        severity: seed % 2 === 0 ? 'critical' : 'low',
        reason: `seed:${seed}`,
      },
    };
  }

  if (kind === 'telemetry') {
    return {
      kind,
      payload: {
        metrics: {
          sampleCount: seed,
          nodeCount: topologyId.length,
        },
      },
    };
  }

  return {
    kind,
    payload: {
      value: seed,
    },
  };
};

const toWorkspaceSeed = (planName: string): WorkspaceSeed => ({
  runId: withBrand(`run-${planName}-${Date.now()}`, 'MeshRunId'),
  planId: withBrand(planName, 'MeshPlanId'),
  topology: parseTopology({
    id: withBrand(`plan-${planName}`, 'MeshPlanId'),
    name: planName,
    version: '1.0.0',
    nodes: [],
    links: [],
    createdAt: Date.now(),
  }),
});

export const useObservabilityWorkspace = (planName: string): ObservabilityWorkspaceState => {
  const storeRef = useRef<InMemoryObservabilityStore | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [events, setEvents] = useState<readonly ObservabilityEventRecord[]>([]);
  const [alerts, setAlerts] = useState<readonly ObservabilityAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const seed = useMemo(() => toWorkspaceSeed(planName), [planName]);

  const refresh = useCallback(async (store: InMemoryObservabilityStore, topologyId: MeshTopology['id']) => {
    const snapshot = await collectSignals(store, topologyId);
    if (!snapshot.ok) {
      return;
    }
    setEvents(snapshot.value);
    setAlerts(snapshot.value
      .filter(isAlertRecord)
      .map((record) => ({
        id: withBrand(record.id, 'mesh-observability-alert'),
        signal: 'alert',
        title: `alert:${record.id}`,
        details: record.alert,
        score: Math.max(0, Math.min(100, record.profile.cycleRisk)),
        trace: ['store', record.id],
      })));
    setHistory(
      snapshot.value
        .map((event) => `event:${'signalIndex' in event ? event.at : event.emittedAt}:${event.id}`)
        .toSorted(),
    );
  }, [seed.runId]);

  const ensureStore = useCallback((): InMemoryObservabilityStore => {
    if (storeRef.current === null) {
      storeRef.current = new InMemoryObservabilityStore();
      void refresh(storeRef.current, seed.topology.id);
    }
    return storeRef.current;
  }, [seed.topology.id, refresh]);

  const runForKind = useCallback(async (kind: MeshSignalKind, value: number) => {
    const store = ensureStore();
    setLoading(true);
    try {
      const index = Math.max(0, Math.floor(value));
      const signal = toSignalPayload(index, kind, planName);
      store.appendRecord({
        runId: seed.runId,
        topology: seed.topology,
        signal,
        planId: seed.topology.id,
      });
      await analyzeTopology({
        planId: seed.topology.id,
        runId: seed.runId,
        topologySeed: seed.topology,
        signal,
      });
      await refresh(store, seed.topology.id);
    } finally {
      setLoading(false);
    }
  }, [ensureStore, planName, refresh, seed.runId, seed.topology]);

  const run = useCallback(async () => {
    const store = ensureStore();
    setLoading(true);
    try {
      for (const [kind, value] of signalSeeds) {
        const signal = toSignalPayload(value, kind, seed.planId);
        store.appendRecord({
          runId: seed.runId,
          topology: seed.topology,
          signal,
          planId: seed.topology.id,
        });
      }
      await refresh(store, seed.topology.id);
    } finally {
      setLoading(false);
    }
  }, [ensureStore, refresh, seed.planId, seed.runId, seed.topology]);

  const reset = useCallback(() => {
    storeRef.current = null;
    setEvents([]);
    setAlerts([]);
    setHistory([]);
    setLoading(false);
  }, []);

  return {
    events,
    history,
    alerts,
    topology: seed.topology,
    loading,
    run,
    runForKind,
    reset,
  };
};
