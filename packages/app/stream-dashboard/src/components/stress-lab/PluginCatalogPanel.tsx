import { useMemo } from 'react';
import type { StreamLabExecutionTrace } from '../../stress-lab/types';

export interface PluginCatalogPanelProps {
  readonly catalog: readonly string[];
  readonly traces: readonly StreamLabExecutionTrace[];
  readonly selected?: string;
  readonly onSelect: (name: string) => void;
}

export const PluginCatalogPanel = ({
  catalog,
  traces,
  selected,
  onSelect,
}: PluginCatalogPanelProps) => {
  const statusByPlugin = useMemo(() => {
    const map = new Map<string, StreamLabExecutionTrace['status']>();
    for (const trace of traces) {
      map.set(trace.pluginName, trace.status);
    }
    return map;
  }, [traces]);

  return (
    <section>
      <h2>Streaming Plugin Catalog</h2>
      <ul>
        {catalog.map((plugin) => {
          const status = statusByPlugin.get(plugin) ?? 'queued';
          return (
            <li key={plugin}>
              <button type="button" onClick={() => onSelect(plugin)} style={{ fontWeight: plugin === selected ? 'bold' : 'normal' }}>
                {plugin}
              </button>
              <span> · </span>
              <strong>{status}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
