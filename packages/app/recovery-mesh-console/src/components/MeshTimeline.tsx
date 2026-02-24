import { useMemo } from 'react';
import { type EngineEnvelope, type MeshPayloadFor, type MeshSignalKind } from '@service/recovery-ops-mesh-engine';
import { type MeshTopology } from '@domain/recovery-ops-mesh';

export interface MeshTimelineProps {
  readonly topology: MeshTopology;
  readonly events: readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[];
}

const isTelemetryValue = (
  payload: MeshPayloadFor<MeshSignalKind>['payload'],
): payload is { value: number } => 'value' in payload && typeof (payload as { value?: unknown }).value === 'number';

export const MeshTimeline = ({ topology, events }: MeshTimelineProps) => {
  const rows = useMemo(
    () =>
      events
        .map((event, index) => ({
          ...event,
          index,
          source: event.source ?? 'unknown',
        }))
        .sort((left, right) => right.emittedAt - left.emittedAt),
    [events],
  );

  const summary = useMemo(() => {
    const grouped = rows.reduce<Record<MeshSignalKind, number>>(
      (acc: Record<MeshSignalKind, number>, row: (typeof rows)[number]) => {
        const kind = row.payload.kind;
        acc[kind] += 1;
        return acc;
      },
      { pulse: 0, snapshot: 0, alert: 0, telemetry: 0 },
    );

    const unique = Array.from(new Set(rows.map((row) => row.source)));
    return {
      ...grouped,
      sources: unique,
      nodeCount: topology.nodes.length,
    };
  }, [rows, topology]);

  return (
    <section>
      <h3>Execution Timeline</h3>
      <p>
        Runs: {rows.length}, Nodes: {summary.nodeCount}, Sources: {summary.sources.join(', ') || 'none'}
      </p>
      <dl>
        <dt>Pulse</dt>
        <dd>{summary.pulse}</dd>
        <dt>Snapshot</dt>
        <dd>{summary.snapshot}</dd>
        <dt>Alert</dt>
        <dd>{summary.alert}</dd>
        <dt>Telemetry</dt>
        <dd>{summary.telemetry}</dd>
      </dl>
      <ul>
        {rows.map((row) => (
          <li key={`${row.id}-${row.index}`}>
            {row.source} {row.payload.kind} @ {new Date(row.emittedAt).toLocaleTimeString()}
            {row.payload.kind === 'pulse' && isTelemetryValue(row.payload.payload)
              ? ` value=${row.payload.payload.value}`
              : ''}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const MeshTimelineCompact = ({
  events,
}: {
  readonly events: readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[];
}) => {
  return (
    <div>
      {events.slice(0, 3).map((event) => (
        <span key={event.id}>
          {event.payload.kind}:{event.payload.payload && 'value' in event.payload.payload
            ? (event.payload.payload as { value?: number }).value ?? '?'
            : '...'}{' '}
        </span>
      ))}
    </div>
  );
};
