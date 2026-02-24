import { useMemo } from 'react';
import { useMeshRuntimeState } from '../hooks/useMeshRuntimeState';
import { useMeshSignalStream } from '../hooks/useMeshSignalStream';
import { MeshTimeline } from './MeshTimeline';
import { MeshTopologyGraph } from './MeshTopologyGraph';

const statusLabel = (health: number): 'healthy' | 'degraded' | 'critical' => {
  if (health >= 85) return 'healthy';
  if (health >= 45) return 'degraded';
  return 'critical';
};

export const MeshRuntimeInspector = () => {
  const runtime = useMeshRuntimeState();
  const stream = useMeshSignalStream();

  const derived = useMemo(() => {
    const runtimeEvents = runtime.events
      .map((entry) => ({
        id: entry.id,
        kind: entry.payload.kind,
        value: entry.payload.kind.length,
      }))
      .toSorted((left, right) => right.value - left.value);

    const counts = runtime.events
      .reduce(
        (acc, event) => {
          acc[event.payload.kind] += 1;
          return acc;
        },
        { pulse: 0, snapshot: 0, alert: 0, telemetry: 0 },
      );

    const source = stream.catalog?.namespace ?? 'default';
    return {
      runtimeEvents,
      counts,
      source,
    };
  }, [runtime.events, stream.catalog?.namespace]);

  return (
    <section>
      <header>
        <h3>Runtime Inspector</h3>
        <p>
          Status: {statusLabel(runtime.health)} | mode={runtime.activeMode} | queue={runtime.queueDepth} | source={derived.source}
        </p>
        <p>Topology nodes: {runtime.topology.nodes.length}</p>
      </header>

      <MeshTimeline topology={runtime.topology} events={[]} />
      <MeshTopologyGraph
        topology={runtime.topology}
        selectedKind={runtime.events[0]?.payload.kind ?? 'pulse'}
        onNodeSelect={() => {
          return void 0;
        }}
      />

      <section>
        <h4>Derived Stats</h4>
        <ul>
          <li>events={runtime.events.length}</li>
          <li>stream={stream.events.length}</li>
          <li>pulse={derived.counts.pulse}</li>
          <li>snapshot={derived.counts.snapshot}</li>
          <li>alert={derived.counts.alert}</li>
          <li>telemetry={derived.counts.telemetry}</li>
        </ul>
      </section>

      <section>
        <h4>Recent events</h4>
        <ul>
          {derived.runtimeEvents.slice(0, 12).map((entry) => (
            <li key={`${entry.id}-${entry.kind}`}>{entry.kind}={entry.value}</li>
          ))}
        </ul>
      </section>

      <button type="button" onClick={runtime.reset}>
        Reset runtime
      </button>
    </section>
  );
};
