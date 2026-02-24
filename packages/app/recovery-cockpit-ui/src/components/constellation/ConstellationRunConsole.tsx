import { FC, useMemo } from 'react';
import type { ConstellationTopology, ConstellationStage } from '@domain/recovery-cockpit-constellation-core';
import type { OrchestratorRuntime } from '@service/recovery-cockpit-constellation-orchestrator';

type RuntimeMetric = {
  readonly stage: ConstellationStage;
  readonly score: number;
  readonly at: string;
};

const formatEvent = (kind: string, value: string): string => `${kind}: ${value}`;

const toTopologyDigest = (topology?: ConstellationTopology) => {
  if (!topology) return 'none';
  return `${topology.nodes.length}/${topology.edges.length}`;
};

export const ConstellationRunConsole: FC<{ runtime?: OrchestratorRuntime | null }> = ({ runtime }) => {
  const { eventRows, scoreRows, categoryBuckets, topology } = useMemo(() => {
    const points = runtime?.telemetry.points ?? [];
    const scores = runtime?.telemetry.scores ?? [];
    const grouped = points.reduce<Record<string, number>>((acc, event) => {
      acc[event.kind] = (acc[event.kind] ?? 0) + 1;
      return acc;
    }, {});
    return {
      eventRows: points.slice(0, 10).map((event) => formatEvent(event.kind, event.message)),
      scoreRows: scores.slice(0, 12).map((entry) => {
        const [stage, score, at] = entry;
        return { stage, score, at };
      }),
      categoryBuckets: Object.entries(grouped),
      topology: runtime?.snapshot?.topologyNodes.length ?? 0,
    };
  }, [runtime?.telemetry.points, runtime?.telemetry.scores, runtime?.snapshot?.topologyNodes.length]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: 14 }}>
      <h3>Run console</h3>
      <p>Topology: {topology?.toString() ?? '0'}</p>
      <p>Topology digest: {toTopologyDigest(runtime?.snapshot ? { nodes: runtime.snapshot.topologyNodes, edges: [] } : undefined)}</p>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <h4>Buckets</h4>
        <h4>Events</h4>
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <ul>
          {categoryBuckets.map(([kind, count]) => (
            <li key={kind}>
              {kind}: {count}
            </li>
          ))}
        </ul>
        <ul>
          {eventRows.length ? (
            eventRows.map((entry) => <li key={entry}>{entry}</li>)
          ) : (
            <li>No events yet</li>
          )}
        </ul>
      </div>

      <h4>Scores</h4>
      <ul>
        {scoreRows.map(({ stage, score, at }, index) => (
          <li key={`${stage}-${index}`}>
            {stage}:{score} @ {at}
          </li>
        ))}
      </ul>
    </section>
  );
};
