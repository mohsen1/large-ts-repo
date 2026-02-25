import { useMemo } from 'react';
import type { MeshPayloadFor, MeshSignalKind, MeshTopology } from '@domain/recovery-ops-mesh';
import {
  isObservationRecord,
  type ObservabilityEventRecord,
} from '@data/recovery-ops-mesh-observability-store';

export interface ObservabilityStoreInspectorProps {
  readonly topology: MeshTopology;
  readonly events: readonly ObservabilityEventRecord[];
  readonly onRefresh: () => void;
}

export const ObservabilityStoreInspector = ({
  topology,
  events,
  onRefresh,
}: ObservabilityStoreInspectorProps) => {
  const timeline = useMemo(
    () => [...events].toSorted((left, right) => {
      const leftAt = 'signalIndex' in left ? left.at : left.emittedAt;
      const rightAt = 'signalIndex' in right ? right.at : right.emittedAt;
      return rightAt - leftAt;
    }),
    [events],
  );

  const [signalCount, alertCount] = timeline.reduce(
    (acc, event) => {
      return eventHasSignal(event)
        ? [`${acc[0] + 1}`, acc[1]]
        : [acc[0], `${acc[1] + 1}`];
    },
    ['0', '0'],
  ) as readonly [string, string];

  return (
    <section>
      <h2>Observability Store Inspector</h2>
      <p>
        Topology {topology.name} ({topology.nodes.length} nodes) • Signals {signalCount}, alerts {alertCount}
      </p>
      <button type="button" onClick={onRefresh}>
        refresh
      </button>
      <ul>
        {timeline.map((event) => (
          <li key={`${event.id}-${('signalIndex' in event ? event.signalIndex : event.emittedAt)}`}>
            {eventToLine(event)}
          </li>
        ))}
      </ul>
    </section>
  );
};

const eventHasSignal = (event: ObservabilityEventRecord): event is ObservabilityEventRecord & {
  readonly signal: MeshPayloadFor<MeshSignalKind>;
} => isObservationRecord(event);

const eventToLine = (event: ObservabilityEventRecord): string => {
  if (!eventHasSignal(event)) {
    return `alert:${event.alert} risk=${event.profile.cycleRisk}`;
  }
  const label = event.signal.kind;
  if (label === 'snapshot') {
    return `snapshot:${event.signal.payload.nodes.length}`;
  }
  if (label === 'alert') {
    return `alert:${event.signal.payload.severity}:${event.signal.payload.reason}`;
  }
  if (label === 'telemetry') {
    return `telemetry:${Object.keys(event.signal.payload.metrics).length} keys`;
  }
  return `pulse:${event.signal.payload.value}`;
};
