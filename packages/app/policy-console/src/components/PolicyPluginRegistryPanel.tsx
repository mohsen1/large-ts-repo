import { useMemo } from 'react';
import { getDefaultPluginsByNamespace, PolicyPluginEnvelope } from '@service/policy-orchestration-engine/plugin-runner';

export interface PluginPanelRow {
  id: string;
  label: string;
  runId: string;
  entries: readonly string[];
}

const byId = (acc: Record<string, string[]>, entry: string): void => {
  const [id, state] = entry.split(':');
  const list = acc[id] ?? [];
  list.push(state);
  acc[id] = list;
}

export interface PolicyPluginRegistryPanelProps {
  namespace: string;
  seed: PolicyPluginEnvelope | null;
}

export const PolicyPluginRegistryPanel = ({ namespace, seed }: PolicyPluginRegistryPanelProps) => {
  const pluginRows = useMemo<readonly PluginPanelRow[]>(() => {
    const plugins = getDefaultPluginsByNamespace(namespace);
    const grouped = {} as Record<string, string[]>;

    const pluginNames = plugins.map((plugin) => plugin.name);
    for (const name of pluginNames) {
      byId(grouped, `${name}:ready`);
    }

    return Object.keys(grouped).map((name) => ({
      id: name,
      label: grouped[name]!.includes('ready') ? `plugin:${name}` : `plugin:${name}`,
      runId: seed?.runId ?? 'idle',
      entries: grouped[name]!,
    }));
  }, [namespace, seed]);

  if (pluginRows.length === 0) {
    return <p>No plugins for namespace {namespace}.</p>;
  }

  return (
    <section>
      <h3>Plugin Registry</h3>
      <p>Tracking {pluginRows.length} plugin entries.</p>
      <ul>
        {pluginRows.map((row) => (
          <li key={row.id}>
            <strong>{row.label}</strong>
            <p>run={row.runId}</p>
            <p>states={row.entries.join(', ')}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
