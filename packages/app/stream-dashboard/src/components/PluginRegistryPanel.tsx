import { useMemo } from 'react';
import { StreamingPolicyPlugins } from '@domain/streaming-observability/policy-plugin-stack';

interface PluginRegistryPanelProps {
  readonly pluginStack: StreamingPolicyPlugins;
  readonly selected: string;
  readonly onSelect: (name: string) => void;
}

export const PluginRegistryPanel = ({
  pluginStack,
  selected,
  onSelect,
}: PluginRegistryPanelProps) => {
  const entries = useMemo(() => pluginStack.map((plugin) => ({
    name: plugin.name,
    kind: plugin.kind,
    version: plugin.version,
    scope: plugin.scope,
  })), [pluginStack]);

  return (
    <section>
      <h2>Policy Plugin Registry</h2>
      <p>Active plugins: {entries.length}</p>
      <ul>
        {entries.map((entry) => {
          const isSelected = entry.name === selected;
          return (
            <li key={entry.name}>
              <button type="button" onClick={() => onSelect(entry.name)} style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
                {entry.name}
              </button>
              <span> | </span>
              <span>{entry.kind}</span>
              <span> | </span>
              <span>{entry.version}</span>
              <span> | </span>
              <span>{entry.scope}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
