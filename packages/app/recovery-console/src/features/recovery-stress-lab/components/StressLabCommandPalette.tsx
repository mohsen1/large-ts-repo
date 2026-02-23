import { ChangeEvent, useMemo, useState } from 'react';
import type { StressLabUiCommand } from '../types';

interface Props {
  readonly commands: readonly StressLabUiCommand[];
  readonly selectedCommandId?: string;
  readonly onSelectCommand: (id: string) => void;
}

export const StressLabCommandPalette = ({ commands, selectedCommandId, onSelectCommand }: Props) => {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(
    () =>
      commands.filter((command) =>
        command.title.toLowerCase().includes(filter.toLowerCase()),
      ),
    [commands, filter],
  );

  const onFilter = (event: ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  if (commands.length === 0) {
    return <p>No commands available.</p>;
  }

  return (
    <section>
      <h2>Command Palette</h2>
      <input value={filter} onChange={onFilter} placeholder="Search commands" />
      <ul>
        {filtered.map((command) => {
          const selected = selectedCommandId === command.id ? 'selected' : '';
          return (
            <li key={command.id}>
              <button type="button" className={selected} onClick={() => onSelectCommand(command.id)}>
                {command.title}
              </button>
              <span>{`steps: ${command.stepCount}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
