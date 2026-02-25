import { useMemo } from 'react';
import type { MeshPayloadFor, MeshSignalKind, MeshTopology } from '@domain/recovery-ops-mesh';
import type { StudioRunResult } from '@service/recovery-ops-mesh-observability-orchestrator';
import { isObservationRecord, isAlertRecord } from '@data/recovery-ops-mesh-observability-store';
import { parseTopology } from '@domain/recovery-ops-mesh';
import { withBrand as brandFromShared } from '@shared/core';

const SIGNAL_KINDS = ['pulse', 'snapshot', 'telemetry', 'alert'] as const;
type SignalKind = typeof SIGNAL_KINDS[number];

type KindBuckets = {
  [K in SignalKind]: readonly MeshPayloadFor<K>[];
};

export interface ObservabilitySignalExplorerProps<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly topology: MeshTopology;
  readonly runs: readonly StudioRunResult<TSignals>[];
  readonly activeKind: MeshSignalKind;
  readonly onKindSelect: (kind: MeshSignalKind) => void;
  readonly selectedRun?: StudioRunResult<TSignals>;
}

const SignalNode = ({
  index,
  signal,
  count,
}: {
  readonly index: number;
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly count: number;
}) => (
  <li>
    <strong>{index + 1}</strong> {signal.kind} x{count}
  </li>
);

const kindToLabel = (kind: MeshSignalKind): string => {
  if (kind === 'snapshot') {
    return 'Snapshot';
  }
  if (kind === 'telemetry') {
    return 'Telemetry';
  }
  if (kind === 'alert') {
    return 'Alert';
  }
  return 'Pulse';
};

const emptyPayload = (kind: MeshSignalKind): MeshPayloadFor<MeshSignalKind> => {
  if (kind === 'pulse') {
    return { kind, payload: { value: 0 } } as MeshPayloadFor<MeshSignalKind>;
  }
  if (kind === 'snapshot') {
    return {
      kind,
      payload: parseTopology({
        id: brandFromShared(`snapshot-${kind}-seed`, 'MeshPlanId'),
        name: `${kind}-seed`,
        version: '1.0.0',
        nodes: [],
        links: [],
        createdAt: 0,
      }),
    } as MeshPayloadFor<MeshSignalKind>;
  }
  if (kind === 'telemetry') {
    return { kind, payload: { metrics: {} } } as MeshPayloadFor<MeshSignalKind>;
  }
  return { kind, payload: { severity: 'low', reason: 'seed' } } as MeshPayloadFor<MeshSignalKind>;
};

const toUnionPayload = <TSignals extends readonly MeshSignalKind[]>(
  byKind: {
    [K in SignalKind]: readonly MeshPayloadFor<K>[];
  },
): KindBuckets => byKind as unknown as KindBuckets;

export const ObservabilitySignalExplorer = <TSignals extends readonly MeshSignalKind[]>({
  topology,
  runs,
  activeKind,
  onKindSelect,
  selectedRun,
}: ObservabilitySignalExplorerProps<TSignals>) => {
  const flattened = useMemo(() => runs.flatMap((run) => run.items), [runs]);

  const byKind = useMemo(() => {
    const buckets: {
      [K in SignalKind]: MeshPayloadFor<K>[];
    } = {
      pulse: [],
      snapshot: [],
      alert: [],
      telemetry: [],
    };

    for (const item of flattened) {
      buckets[item.signal.kind] = [...buckets[item.signal.kind], item.signal] as never;
    }

    return buckets;
  }, [flattened]);

  const selectedSignals = useMemo(() => {
    if (!selectedRun) {
      return [];
    }
    return selectedRun.items.map((item) => item.signal);
  }, [selectedRun]);

  const selectedEvents = useMemo(() => {
    if (!selectedRun) {
      return [];
    }
    return selectedRun.events.filter((event) => isObservationRecord(event) || isAlertRecord(event));
  }, [selectedRun]);

  const topKinds = useMemo(() => {
    const sorted = SIGNAL_KINDS.toSorted((left, right) => {
      const leftCount = byKind[left].length;
      const rightCount = byKind[right].length;
      return rightCount - leftCount;
    });
    return sorted.filter((kind) => byKind[kind].length > 0);
  }, [byKind]);

  const snapshot: KindBuckets = useMemo(() => toUnionPayload(byKind), [byKind]);

  return (
    <section>
      <h3>Signal Explorer</h3>
      <p>{`Topology: ${topology.id} (${topology.nodes.length} nodes)`}</p>

      <nav>
        {SIGNAL_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-active={kind === activeKind}
            onClick={() => onKindSelect(kind)}
          >
            {kindToLabel(kind)} {byKind[kind].length}
          </button>
        ))}
      </nav>

      <h4>Signals by kind</h4>
      <ul>
        {topKinds.map((kind, index) => (
          <SignalNode
            key={kind}
            index={index}
            signal={snapshot[kind]?.[0] ?? emptyPayload(kind)}
            count={snapshot[kind].length}
          />
        ))}
      </ul>

      <h4>Run detail</h4>
      <ul>
        {selectedSignals.map((signal, index) => (
          <li key={`${selectedRun?.id}-${index}`}>
            {signal.kind} #{signal.kind === 'snapshot' ? signal.payload.name : signal.payload.toString?.() ?? signal.kind}
          </li>
        ))}
      </ul>

      <p>{`total events ${selectedEvents.length} / selected signals ${selectedSignals.length}`}</p>
      <ul>
        {selectedEvents.map((event) => (
          <li key={event.id}>
            {isAlertRecord(event) ? `alert:${event.alert}` : `${event.signal.kind}:${event.id}`}
          </li>
        ))}
      </ul>
    </section>
  );
};
