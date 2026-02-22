import { useMemo } from 'react';
import type { FabricPlan } from '@domain/recovery-fabric-orchestration';

export interface FabricNetworkGraphProps {
  readonly plan: FabricPlan | null;
  readonly selectedCommandId: string | null;
  readonly onSelect: (commandId: string) => void;
}

export const FabricNetworkGraph = ({ plan, selectedCommandId, onSelect }: FabricNetworkGraphProps) => {
  const nodeMap = useMemo(() => {
    if (!plan) {
      return [] as Array<{ readonly id: string; readonly name: string; readonly deps: readonly string[] }>;
    }

    const byId = new Map(plan.commands.map((command) => [command.id, command]));
    return plan.topology.commandIds
      .map((commandId) => {
        const command = byId.get(commandId);
        if (!command) {
          return {
            id: commandId,
            name: `Missing ${commandId}`,
            deps: [],
          };
        }
        return {
          id: command.id,
          name: command.name,
          deps: plan.topology.edges
            .filter((edge) => edge.to === command.id)
            .map((edge) => edge.from),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [plan]);

  return (
    <section className="fabric-network-graph">
      <h3>Command Topology</h3>
      {nodeMap.length === 0 && <p>No commands configured.</p>}
      <ul>
        {nodeMap.map((node) => {
          const isActive = node.id === selectedCommandId;
          return (
            <li
              key={node.id}
              className={isActive ? 'fabric-command-node fabric-command-node--active' : 'fabric-command-node'}
              onClick={() => onSelect(node.id)}
            >
              <strong>{node.name}</strong>
              <span>{node.id}</span>
              <small>
                Deps: {node.deps.length > 0 ? node.deps.join(', ') : 'none'}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
