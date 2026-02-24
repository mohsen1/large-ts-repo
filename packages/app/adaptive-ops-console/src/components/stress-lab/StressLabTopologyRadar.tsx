import { useMemo, type ReactNode } from 'react';
import { type WorkloadTopology } from '@domain/recovery-stress-lab';

interface StressLabTopologyRadarProps {
  readonly topology: WorkloadTopology;
  readonly selectedNodeIds?: readonly string[];
}

interface RadarRow {
  readonly nodeId: string;
  readonly title: string;
  readonly intensity: number;
  readonly active: boolean;
}

const normalize = (value: number): number => {
  if (value < 0) return 0;
  if (value > 10) return 10;
  return value;
};

const clamp = (value: number): string => {
  const unit = Math.max(0, Math.min(10, value));
  const bars = Math.round(unit);
  return '█'.repeat(bars);
};

const buildRows = (topology: WorkloadTopology): readonly RadarRow[] => {
  const rows = topology.nodes.map((node) => ({
    nodeId: node.id,
    title: `${node.name} (${node.ownerTeam})`,
    intensity: normalize(node.criticality / 2),
    active: node.active,
  }));

  return rows.toSorted((left, right) => {
    if (left.active === right.active) return right.intensity - left.intensity;
    return Number(right.active) - Number(left.active);
  });
};

const RowList = ({ rows }: { readonly rows: readonly RadarRow[] }): ReactNode => {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.nodeId}>
          <span>{row.title}</span>
          <strong>{row.active ? 'ACTIVE' : 'STANDBY'}</strong>
          <span>{clamp(row.intensity)}</span>
        </li>
      ))}
    </ul>
  );
};

const EdgeTable = ({ topology }: { readonly topology: WorkloadTopology }): ReactNode => {
  const rows = topology.edges.map((edge) => ({
    key: `${edge.from}:${edge.to}`,
    from: edge.from,
    to: edge.to,
    coupling: Number(edge.coupling.toFixed(3)),
    reason: edge.reason,
  }));

  return (
    <table>
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>Coupling</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.from}</td>
            <td>{row.to}</td>
            <td>{row.coupling}</td>
            <td>{row.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const StressLabTopologyRadar = ({ topology, selectedNodeIds = [] }: StressLabTopologyRadarProps) => {
  const rows = useMemo(() => buildRows(topology), [topology]);
  const filtered = useMemo(
    () => rows.filter((row) => selectedNodeIds.length === 0 || selectedNodeIds.includes(row.nodeId)),
    [rows, selectedNodeIds],
  );
  const totalRisk = useMemo(
    () => filtered.reduce((acc, row) => acc + row.intensity, 0),
    [filtered],
  );

  return (
    <section className="stress-lab-topology-radar">
      <h3>Topology radar</h3>
      <div>
        <strong>Node count:</strong> {rows.length}
      </div>
      <div>
        <strong>Filtered:</strong> {filtered.length}
      </div>
      <div>
        <strong>Intensity:</strong> {totalRisk.toFixed(1)}
      </div>
      <RowList rows={filtered} />
      <EdgeTable topology={topology} />
    </section>
  );
};
