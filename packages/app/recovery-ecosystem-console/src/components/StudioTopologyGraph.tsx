import { useMemo, type ReactElement } from 'react';
import type { PluginNode } from '@domain/recovery-ecosystem-analytics';
import { mapWithIteratorHelpers } from '@shared/type-level';

interface TopologyEdge {
  readonly from: string;
  readonly to: string;
}

interface StudioTopologyGraphProps {
  readonly plugins: readonly PluginNode[];
  readonly selected?: string;
  readonly onSelect: (plugin: string) => void;
}

const asLabel = (value: string): string => value.replace('plugin:', '').replace(/-/g, ' ');

const buildEdges = (plugins: readonly PluginNode[]): readonly TopologyEdge[] => {
  if (plugins.length === 0) {
    return [];
  }
  return mapWithIteratorHelpers(
    plugins.toSpliced(1),
    (_entry, index) => ({
      from: plugins[index].name,
      to: plugins[index + 1]?.name ?? plugins[index].name,
    }),
  );
};

export const StudioTopologyGraph = ({
  plugins,
  selected = '',
  onSelect,
}: StudioTopologyGraphProps): ReactElement => {
  const edges = useMemo(() => buildEdges(plugins), [plugins]);
  return (
    <section>
      <h4>Topology Graph</h4>
      <p>nodes={plugins.length}</p>
      <ul>
        {plugins.map((entry) => {
          const active = selected === entry.name;
          return (
            <li key={entry.name}>
              <button
                type="button"
                onClick={() => onSelect(entry.name)}
                style={{
                  borderRadius: 12,
                  border: active ? '2px solid #22c55e' : '1px solid #94a3b8',
                  background: active ? '#dcfce7' : '#f8fafc',
                  margin: 4,
                  minWidth: 220,
                  textAlign: 'left',
                }}
              >
                <strong>{asLabel(entry.name)}</strong>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{entry.namespace}</div>
              </button>
            </li>
          );
        })}
      </ul>
      <p>edges={edges.length}</p>
      <ol>
        {edges.map((edge) => (
          <li key={`${edge.from}:${edge.to}`}>
            {edge.from}
            {' '}
            →
            {' '}
            {edge.to}
          </li>
        ))}
      </ol>
    </section>
  );
};
