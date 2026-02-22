import { useMemo } from 'react';
import type { FabricWorkspaceCommand } from '../../hooks/useRecoveryFabricWorkspace';

export interface FabricCommandDeckProps {
  readonly commands: readonly FabricWorkspaceCommand[];
  readonly onHighlight: (commandId: string) => void;
}

export const FabricCommandDeck = ({ commands, onHighlight }: FabricCommandDeckProps) => {
  const grouped = useMemo(() => {
    const buckets = new Map<number, typeof commands[number][] >();
    for (const command of commands) {
      const bucket = buckets.get(command.priority) ?? [];
      bucket.push(command);
      buckets.set(command.priority, bucket);
    }
    return Array.from(buckets.entries()).sort((left, right) => left[0] - right[0]);
  }, [commands]);

  return (
    <section className="fabric-command-deck">
      <h3>Command Deck</h3>
      {grouped.map(([priority, items]) => (
        <article key={priority}>
          <h4>Priority {priority}</h4>
          <ul>
            {items.map((command) => (
              <li key={command.commandId}>
                <span>{command.name}</span>
                <button onClick={() => onHighlight(command.commandId)}>Focus</button>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
};
