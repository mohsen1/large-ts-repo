import { type ReactElement, useMemo } from 'react';
import {
  asChronicleGraphLane,
  asChronicleGraphNodeId,
  type ChronicleGraphBlueprint,
  type ChronicleGraphNodeId,
  type ChronicleGraphStatus,
  type ChronicleGraphPhase,
} from '@domain/recovery-chronicle-graph-core';
import { type GraphWorkspaceState } from '@service/recovery-chronicle-graph-orchestrator';

export interface ChronicleGraphTopologyProps {
  readonly blueprint: ChronicleGraphBlueprint;
  readonly status: ChronicleGraphStatus;
  readonly onSelectNode?: (nodeId: ChronicleGraphNodeId) => void;
}

export const ChronicleGraphTopology = ({ blueprint, status, onSelectNode }: ChronicleGraphTopologyProps): ReactElement => {
  const laneDistribution = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const node of blueprint.nodes) {
      const lane = String(node.lane ?? 'lane:control');
      grouped.set(lane, (grouped.get(lane) ?? 0) + 1);
    }
    return [...grouped.entries()].toSorted(([left], [right]) => left.localeCompare(right));
  }, [blueprint.nodes]);

  const edgeWeightTotal = blueprint.edges.reduce((acc, edge) => acc + edge.weight, 0);

  const phases = useMemo(
    () => blueprint.nodes.map((node, index): ChronicleGraphPhase => (index % 2 === 0 ? 'phase:bootstrap' : 'phase:execution')),
    [blueprint.nodes],
  );

  return (
    <section>
      <h2>
        {blueprint.title} ({blueprint.nodes.length}/{blueprint.edges.length})
      </h2>
      <p>status: {status}</p>
      <p>total edge weight: {edgeWeightTotal.toFixed(2)}</p>
      <ul>
        {blueprint.nodes.map((node, index) => (
          <li key={String(node.id)}>
            <button type="button" onClick={() => onSelectNode?.(node.id)}>
              {node.name} - {phases[index]} - deps {node.dependsOn.length}
            </button>
          </li>
        ))}
      </ul>
      <section>
        <h3>Lane distribution</h3>
        <ul>
          {laneDistribution.map(([lane, count]) => (
            <li key={lane}>
              {lane}: {count}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Node controls</h3>
        <p>
          bootstrap token: {asChronicleGraphNodeId('bootstrap').replace('node:', '')} via {asChronicleGraphLane('control')}
        </p>
      </section>
      <dl>
        <dt>Phases</dt>
        <dd>
          {phases.map((phase) => (
            <span key={phase} style={{ marginRight: 8 }}>
              {phase}
            </span>
          ))}
        </dd>
      </dl>
    </section>
  );
};

export const GraphWorkspaceSummary = ({
  workspaces,
}: {
  readonly workspaces: readonly GraphWorkspaceState[];
}): ReactElement => {
  const healthy = workspaces.filter((item) => item.status === 'completed').length;
  const degraded = workspaces.length - healthy;
  const pluginSignal = workspaces.reduce((acc, state) => acc + state.pluginCount, 0);

  return (
    <section>
      <h3>Workspace Summary</h3>
      <p>
        Completed: {healthy} / {workspaces.length} | Degraded: {degraded} | Plugins: {pluginSignal}
      </p>
    </section>
  );
};
