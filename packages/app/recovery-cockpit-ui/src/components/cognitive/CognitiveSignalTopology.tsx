import { type CSSProperties, useMemo } from 'react';
import { useCognitiveCockpitWorkspace } from '../../hooks/useCognitiveCockpitWorkspace';

type TopologyLink = {
  readonly from: string;
  readonly to: string;
  readonly metric: number;
};

const nodeStyle = (index: number): CSSProperties => ({
  display: 'inline-flex',
  minWidth: 120,
  border: '1px solid #8aa9',
  borderRadius: 8,
  padding: 8,
  marginRight: 8,
  marginBottom: 8,
  background: `hsl(${index * 45}, 60%, 24%)`,
  color: '#fff',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});

const buildTopology = (counts: Readonly<Record<string, number>>): readonly TopologyLink[] => {
  const entries = Object.entries(counts);
  return entries.flatMap(([from, count], index) =>
    entries.slice(index + 1).map(([to]) => ({
      from,
      to,
      metric: count,
    })),
  );
};

export interface CognitiveSignalTopologyProps {
  readonly tenantId: string;
  readonly workspaceId: string;
}

export const CognitiveSignalTopology = ({ tenantId, workspaceId }: CognitiveSignalTopologyProps) => {
  const { metrics, loading, refresh } = useCognitiveCockpitWorkspace({ tenantId, workspaceId });

  const links = useMemo(() => buildTopology(metrics.byLayer), [metrics.byLayer]);
  const nodes = useMemo(
    () =>
      Object.entries(metrics.byLayer).map(([layer, count], index) => (
        <div key={layer} style={nodeStyle(index)}>
          <strong>{layer}</strong>
          <span>{count} signals</span>
        </div>
      )),
    [metrics.byLayer],
  );

  return (
    <section>
      <header>
        <h2>Signal topology</h2>
        <p>{loading ? 'Refreshing topology…' : `${metrics.total} total signals`}</p>
        <button type="button" onClick={() => void refresh()}>
          Recompute
        </button>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{nodes}</div>
      <ul>
        {links.map((edge) => (
          <li key={`${edge.from}-${edge.to}`}>
            {edge.from} → {edge.to} ({edge.metric})
          </li>
        ))}
      </ul>
    </section>
  );
};
