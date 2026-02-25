import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';
import {
  parseTopology,
  type MeshTopology as DomainTopology,
} from '@domain/recovery-ops-mesh';
import {
  runStudioBatch,
  runObservabilityWorkspace,
  type StudioRunInput,
  type StudioRunResult,
} from '@service/recovery-ops-mesh-observability-orchestrator';
import {
  isObservationRecord,
  type RecordCursor,
} from '@data/recovery-ops-mesh-observability-store';

const defaultTopology = parseTopology({
  id: 'observability-workspace-topology',
  name: 'observability-workspace-topology',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

const defaultSignals = ['pulse', 'snapshot', 'telemetry', 'alert'] as const satisfies readonly MeshSignalKind[];

export interface UseObservabilityEngineOptions {
  readonly topology: Parameters<typeof parseTopology>[0];
  readonly signals?: readonly MeshSignalKind[];
  readonly namespace?: string;
}

export interface UseObservabilityEngineState<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly active: boolean;
  readonly planId: MeshPlanId;
  readonly topology: DomainTopology;
  readonly signals: TSignals;
  readonly lastRun: StudioRunResult<TSignals> | undefined;
  readonly runs: readonly StudioRunResult<TSignals>[];
  readonly busy: boolean;
  readonly eventCount: number;
  readonly cursor: RecordCursor | undefined;
  readonly lastSignals: readonly MeshPayloadFor<MeshSignalKind>[];
  readonly refresh: () => Promise<void>;
  readonly run: (signals?: TSignals) => Promise<StudioRunResult<TSignals> | undefined>;
  readonly runPreset: (seed: number) => Promise<StudioRunResult<TSignals> | undefined>;
}

const signalPalette = ['pulse', 'snapshot', 'alert', 'telemetry'] as const;

const signalWeight = (channel: string): number => {
  const signal = channel.split(':').at(1) ?? 'pulse';
  if (signal === 'alert') {
    return 4;
  }
  if (signal === 'snapshot') {
    return 2;
  }
  if (signal === 'telemetry') {
    return 1;
  }
  return 1;
};

const toPathScore = <TSignals extends readonly MeshSignalKind[]>(
  topology: DomainTopology,
  signals: TSignals,
): number =>
  topology.links.reduce((acc, edge) => {
    const first = edge.channels.at(0) ?? 'mesh-signal:pulse';
    const weight = signals.includes('snapshot') ? signalWeight(first) : 1;
    return acc + weight;
  }, 0);

const sortByKind = (
  left: MeshPayloadFor<MeshSignalKind>,
  right: MeshPayloadFor<MeshSignalKind>,
): number => right.kind.localeCompare(left.kind);

export const useObservabilityEngine = <TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]>(
  options: UseObservabilityEngineOptions = {
    topology: defaultTopology,
    signals: defaultSignals,
  },
): UseObservabilityEngineState<TSignals> => {
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<StudioRunResult<TSignals> | undefined>(undefined);
  const [runs, setRuns] = useState<readonly StudioRunResult<TSignals>[]>([]);
  const [pathWeight, setPathWeight] = useState(0);
  const [cursor, setCursor] = useState<RecordCursor | undefined>(undefined);

  const topology = useMemo(() => parseTopology(options.topology), [options.topology]);
  const signals = (options.signals ?? defaultSignals) as TSignals;
  const planId = topology.id;

  const namespace = options.namespace ?? `mesh-workspace-${planId}`;
  const clear = useCallback(() => {
    setRuns([]);
    setLastRun(undefined);
    setCursor(undefined);
    setPathWeight(0);
  }, []);

  const refresh = useCallback(async () => {
    if (!lastRun) {
      return;
    }

    setBusy(true);
    try {
      const next = await runObservabilityWorkspace({
        topologySeed: topology,
        signals,
      } as StudioRunInput<TSignals>);
      setRuns((current) => [next, ...current].slice(0, 12));
      setLastRun(next);
      setPathWeight(toPathScore(topology, signals));
      setCursor({
        token: withBrand(`cursor-${next.id}`, 'obs-store-cursor'),
        records: next.events,
        hasMore: false,
      });
    } finally {
      setBusy(false);
    }
  }, [lastRun, topology, signals]);

  const run = useCallback(async (nextSignals?: TSignals) => {
    setBusy(true);
    try {
      const next = await runStudioBatch({
        topologySeed: topology,
        signals: nextSignals ?? signals,
        namespace,
      });
      setLastRun(next as StudioRunResult<TSignals>);
      setRuns((current) => [next as StudioRunResult<TSignals>, ...current].slice(0, 12));
      setPathWeight(toPathScore(topology, signals));
      setCursor({
        token: withBrand(`cursor-${(next as StudioRunResult<TSignals>).id}`, 'obs-store-cursor'),
        records: next.events,
        hasMore: false,
      });
      return next as StudioRunResult<TSignals>;
    } finally {
      setBusy(false);
    }
  }, [signals, topology, namespace]);

  const runPreset = useCallback(async (seed: number) => {
    const pivot = Math.abs(seed % signals.length);
    const rotated = [...signals.slice(pivot), ...signals.slice(0, pivot)] as unknown as TSignals;
    return run(rotated);
  }, [run, signals]);

  useEffect(() => {
    if (topology.nodes.length === 0) {
      setPathWeight(0);
      return;
    }
    setPathWeight(toPathScore(topology, signals));
  }, [topology.nodes.length, signals]);

  const lastSignals = useMemo(() => {
    if (!lastRun) {
      return [] as const as readonly MeshPayloadFor<MeshSignalKind>[];
    }
    return [...lastRun.items]
      .map((item) => item.signal)
      .toSorted(sortByKind)
      .filter((signal) => signal.kind !== 'snapshot');
  }, [lastRun]);

  const eventCount = useMemo(() => {
    if (!lastRun) {
      return 0;
    }
    return lastRun.events.length;
  }, [lastRun]);

  return {
    active: pathWeight > 0,
    planId,
    topology,
    signals,
    lastRun,
    runs,
    busy,
    eventCount,
    cursor,
    lastSignals,
    refresh,
    run,
    runPreset,
  };
};
