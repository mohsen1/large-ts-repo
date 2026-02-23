import { useMemo } from 'react';
import type { CommandLabCommandTile } from '../../types/recoveryCommandLab';
import type { ReactElement } from 'react';

interface CommandLabRunlineProps {
  readonly items: readonly CommandLabCommandTile[];
}

export const CommandLabRunline = ({ items }: CommandLabRunlineProps): ReactElement => {
  const grouped = useMemo(() => {
    const map = new Map<string, CommandLabCommandTile[]>();
    for (const item of items) {
      const bucket = item.state;
      const current = map.get(bucket) ?? [];
      map.set(bucket, [...current, item]);
    }
    return [...map.entries()].map(([state, entries]) => ({ state, entries }));
  }, [items]);

  const total = items.length;
  return (
    <section className="command-lab-runline">
      <h4>Command lanes</h4>
      <p>{`total commands: ${total}`}</p>
      <div>
        {grouped.map((group) => (
          <details key={group.state}>
            <summary>{`${group.state} (${group.entries.length})`}</summary>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.commandId}>
                  <strong>{entry.title}</strong>
                  <span>{`owner=${entry.owner}`}</span>
                  <span>{`risk=${entry.riskScore.toFixed(2)}`}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
};
