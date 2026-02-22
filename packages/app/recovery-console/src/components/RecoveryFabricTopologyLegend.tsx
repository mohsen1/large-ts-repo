import { useMemo } from 'react';

import type { FabricTopologyEdge } from '@domain/recovery-fabric-models';

interface RecoveryFabricTopologyLegendProps {
  readonly edges: readonly FabricTopologyEdge[];
  readonly zoneFilter: 'all' | 'core' | 'edge' | 'satellite';
  readonly onZoneFilterChange: (filter: 'all' | 'core' | 'edge' | 'satellite') => void;
}

interface LegendItem {
  readonly value: string;
  readonly text: string;
}

const buildLegend = (edges: readonly FabricTopologyEdge[]): readonly LegendItem[] => {
  const byActive = edges.reduce(
    (acc, edge) => {
      const key = edge.active ? 'active' : 'degraded';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    { active: 0, degraded: 0 } as { active: number; degraded: number },
  );

  const activePercent = edges.length === 0 ? 0 : Number(((byActive.active / edges.length) * 100).toFixed(1));
  const degradedPercent = edges.length === 0 ? 0 : Number(((byActive.degraded / edges.length) * 100).toFixed(1));

  return [
    { value: `active-${activePercent}%`, text: `active ${byActive.active} (${activePercent}%)` },
    { value: `degraded-${degradedPercent}%`, text: `degraded ${byActive.degraded} (${degradedPercent}%)` },
  ];
};

export const RecoveryFabricTopologyLegend = ({
  edges,
  zoneFilter,
  onZoneFilterChange,
}: RecoveryFabricTopologyLegendProps) => {
  const legend = useMemo(() => buildLegend(edges), [edges]);

  return (
    <section>
      <h3>Topology legend</h3>
      <div>
        <select
          value={zoneFilter}
          onChange={(event) =>
            onZoneFilterChange(event.target.value as 'all' | 'core' | 'edge' | 'satellite')
          }
        >
          <option value="all">All zones</option>
          <option value="core">Core</option>
          <option value="edge">Edge</option>
          <option value="satellite">Satellite</option>
        </select>
      </div>
      <ul>
        {legend.map((item) => (
          <li key={item.value}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
};
