import { useMemo } from 'react';
import type { PluginDefinition } from '@shared/cascade-orchestration-kernel';

export interface PluginRegistryPanelProps {
  readonly plugins: ReadonlyArray<string>;
  readonly selected: ReadonlySet<string>;
  readonly onSelect: (ids: string[]) => void;
}

type PluginGroup = {
  readonly group: string;
  readonly members: readonly string[];
};

export const PluginRegistryPanel = ({ plugins, selected, onSelect }: PluginRegistryPanelProps) => {
  const grouped = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const plugin of plugins) {
      const [prefix] = plugin.split('.');
      const bucket = groups.get(prefix) ?? [];
      groups.set(prefix, [...bucket, plugin]);
    }

    return [...groups.entries()].map(([group, members]): PluginGroup => ({ group, members }));
  }, [plugins]);

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onSelect([...next]);
  };

  return (
    <section>
      <h3>Plugin Registry</h3>
      {grouped.map(({ group, members }) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          <div>
            {members.map((name) => {
              const checked = selected.has(name);
              return (
                <label key={name} style={{ display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(name)}
                    />
                    {name}
                  </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </section>
  );
};

export const collectPluginNames = (plugins: readonly PluginDefinition[]): readonly string[] =>
  plugins.map((plugin) => plugin.name);
