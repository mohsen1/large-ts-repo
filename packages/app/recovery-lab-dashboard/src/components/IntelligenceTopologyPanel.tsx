import { useMemo } from 'react';
import type { OrchestrationMode, TopologyEdge, TopologyNodeSpec } from '@domain/recovery-lab-intelligence-core';
import { buildTopology } from '@domain/recovery-lab-intelligence-core';
import type { BaseTopologyPayload, TopologyLevel } from '@domain/recovery-lab-intelligence-core';

interface IntelligenceTopologyPanelProps {
  readonly workspace: string;
  readonly tenant: string;
  readonly mode: OrchestrationMode;
}

interface TopologyCell {
  readonly id: string;
  readonly lane: string;
  readonly mode: string;
}

const parseCell = (value: unknown): TopologyCell[] => {
  if (typeof value !== 'string') {
    return [];
  }
  const [id, lane = 'forecast', route = 'analyze'] = value.split('::');
  return [{
    id,
    lane: lane || 'forecast',
    mode: route || 'analyze',
  }];
};

export const IntelligenceTopologyPanel = ({ workspace, tenant, mode }: IntelligenceTopologyPanelProps): React.JSX.Element => {
  const specs = useMemo(
    () => [
      {
        name: `root-${workspace}`,
        kind: 'plugin',
        level: 'seed',
        mode,
        lane: 'forecast',
        seed: 1,
        payload: {
          level: 'seed',
          lane: 'forecast',
          mode,
          score: 1,
          tenant,
          workspace,
          kind: 'root',
          source: 'panel',
        },
      },
      {
        name: `stage-a-${tenant}`,
        kind: 'metric',
        level: 'analysis',
        mode,
        lane: 'resilience',
        seed: 0.7,
        payload: {
          level: 'analysis',
          lane: 'resilience',
          mode,
          score: 0.7,
          tenant,
          workspace,
          kind: 'analysis',
          source: 'panel',
        },
      },
      {
        name: `stage-b-${tenant}`,
        kind: 'guard',
        level: 'execution',
        mode,
        lane: 'recovery',
        seed: 0.4,
        payload: {
          level: 'execution',
          lane: 'recovery',
          mode,
          score: 0.4,
          tenant,
          workspace,
          kind: 'guard',
          source: 'panel',
        },
      },
    ],
    [mode, tenant, workspace],
  );

  const topology = useMemo(
    () =>
      buildTopology(
        'recovery-lab-dashboard-intel',
        specs as readonly TopologyNodeSpec<string, Record<string, unknown>>[],
      ),
    [mode, specs, tenant, workspace],
  );
  const nodes = useMemo(() => topology.listNodes(), [topology]);
  const edges = useMemo(() => topology.listEdges(), [topology]);
  const routeTrace = useMemo(() => parseCell(`${workspace}::${tenant}::${mode}`), [workspace, tenant, mode]);

  const nodeRows = useMemo(
    () =>
      nodes
        .map((node) => parseCell(`${String(node.id)}::${String(node.payload.lane)}::${String(node.payload.mode)}`)[0])
        .filter((entry): entry is TopologyCell => Boolean(entry)),
    [nodes],
  );

  const edgeRows = useMemo(() => edges as readonly TopologyEdge[], [edges]);

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Topology</h3>
      <p style={{ color: '#444' }}>{`workspace=${workspace} tenant=${tenant}`}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>node</th>
            <th style={{ textAlign: 'left' }}>lane</th>
            <th style={{ textAlign: 'left' }}>mode</th>
          </tr>
        </thead>
        <tbody>
          {nodeRows.map((row, index) => (
            <tr key={`${row.id}-${index}`}>
              <td>{row.id}</td>
              <td>{row.lane}</td>
              <td>{row.mode}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Edges</h4>
      <ul>
        {edgeRows.map((edge, index) => (
          <li key={`${edge.from}->${edge.to}-${index}`}>{`${edge.from}->${edge.to} · weight=${edge.weight}`}</li>
        ))}
      </ul>
      <h4>Route cells</h4>
      <ul>
        {routeTrace.map((entry) => (
          <li key={entry.id}>{`${entry.id} :: ${entry.lane} :: ${entry.mode}`}</li>
        ))}
      </ul>
    </section>
  );
};
