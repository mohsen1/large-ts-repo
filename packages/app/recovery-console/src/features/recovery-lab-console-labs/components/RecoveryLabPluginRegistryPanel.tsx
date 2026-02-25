import { useMemo } from 'react';
import type { LabPluginCard, PluginRuntimeRow } from '../types';

export interface RecoveryLabPluginRegistryPanelProps {
  readonly plugins: readonly LabPluginCard[];
  readonly rows: readonly PluginRuntimeRow[];
}

const sortByStatus = (rows: readonly PluginRuntimeRow[]): readonly PluginRuntimeRow[] => {
  return [...rows].sort((left, right) => {
    if (left.events === right.events) {
      return left.pluginName.localeCompare(right.pluginName);
    }
    return right.events - left.events;
  });
};

export const RecoveryLabPluginRegistryPanel = ({ plugins, rows }: RecoveryLabPluginRegistryPanelProps) => {
  const normalized = useMemo(() => sortByStatus(rows), [rows]);

  return (
    <section className="plugin-registry">
      <header>
        <h3>Registered Plugins ({plugins.length})</h3>
      </header>
      <div className="registry-grid">
        {plugins.map((plugin) => (
          <article key={plugin.pluginName} className="plugin-card">
            <h4>{plugin.pluginName}</h4>
            <p>
              {plugin.pluginKind} · {plugin.category} · {plugin.domain}
            </p>
            <small>deps: {plugin.dependencyCount}</small>
          </article>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Topic</th>
            <th>Status</th>
            <th>Events</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {normalized.map((row) => (
            <tr key={row.pluginName}>
              <td>{row.pluginName}</td>
              <td>{row.topic}</td>
              <td>{row.status}</td>
              <td>{row.events}</td>
              <td>{row.notes.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
