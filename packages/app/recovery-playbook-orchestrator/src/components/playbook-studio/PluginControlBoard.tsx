import { memo } from 'react';

export interface PluginEntry {
  readonly id: string;
  readonly enabled: boolean;
  readonly capabilities: readonly string[];
}

export interface PluginControlBoardProps {
  readonly title: string;
  readonly plugins: readonly PluginEntry[];
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
}

const sortPlugins = (plugins: readonly PluginEntry[]) =>
  [...plugins].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

export const PluginControlBoard = memo(({ title, plugins, onToggle }: PluginControlBoardProps) => {
  const ordered = sortPlugins(plugins);

  return (
    <section className="plugin-control-board">
      <h3>{title}</h3>
      <ul>
        {ordered.map((plugin) => (
          <li key={plugin.id} className="plugin-control-board__item">
            <div>
              <strong>{plugin.id}</strong>
              <p>{plugin.capabilities.join(', ') || 'none'}</p>
            </div>
            <label>
              <input
                type="checkbox"
                checked={plugin.enabled}
                onChange={(event) => onToggle(plugin.id, event.currentTarget.checked)}
              />
              {plugin.enabled ? 'enabled' : 'disabled'}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
});

PluginControlBoard.displayName = 'PluginControlBoard';
