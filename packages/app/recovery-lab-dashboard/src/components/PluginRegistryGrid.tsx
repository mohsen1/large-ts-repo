import { useMemo } from 'react';
import type { PluginRuntime } from '@service/recovery-lab-orchestrator';
import { useLabWorkspace } from '../hooks/useLabWorkspace';

interface PluginRegistryGridProps {
  readonly tenant: string;
}

export const PluginRegistryGrid = ({ tenant }: PluginRegistryGridProps) => {
  const workspace = useLabWorkspace(tenant);

  const plugins = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scenario of workspace.scenarios) {
      for (const signal of scenario.signals) {
        const bucket = counts.get(signal.name) ?? 0;
        counts.set(signal.name, bucket + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [workspace.scenarios]);

  const pluginRows = plugins.toSorted((left, right) => right.count - left.count);

  return (
    <section>
      <h3>Observed plugins</h3>
      <table>
        <thead>
          <tr>
            <th>plugin</th>
            <th>signals</th>
          </tr>
        </thead>
        <tbody>
          {pluginRows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>runs={workspace.executions.length}</p>
      <p>latestLogs={workspace.logs.length}</p>
    </section>
  );
};
