import { useMemo, type ReactElement, type ReactNode } from 'react';

type RegistryItem = {
  readonly name: string;
  readonly stageCount: number;
  readonly latencyMs: number;
  readonly healthy: boolean;
};

export interface PluginRegistryPanelProps {
  readonly items: readonly RegistryItem[];
  readonly onRefresh: () => void;
  readonly loading: boolean;
}

const statusClass = (healthy: boolean): string => (healthy ? 'plugin-card healthy' : 'plugin-card degraded');

const PluginMetric = ({ item }: { readonly item: RegistryItem }) => {
  const trend = item.latencyMs < 150 ? 'fast' : item.latencyMs < 500 ? 'steady' : 'slow';
  return (
    <li className={statusClass(item.healthy)}>
      <h4>{item.name}</h4>
      <p>Stages: {item.stageCount}</p>
      <p>Latency: {item.latencyMs.toFixed(0)}ms</p>
      <p>Health: {item.healthy ? 'healthy' : 'degraded'} ({trend})</p>
    </li>
  );
};

export const PluginRegistryPanel = ({ items, onRefresh, loading }: PluginRegistryPanelProps): ReactElement => {
  const sorted = useMemo(() => [...items].sort((left, right) => right.stageCount - left.stageCount), [items]);

  return (
    <section className="plugin-registry">
      <header>
        <h3>Ecosystem Plugins</h3>
        <button type="button" onClick={() => onRefresh()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      <ul>{sorted.map((item) => <PluginMetric key={item.name} item={item} />)}</ul>
    </section>
  );
};

export const PluginRegistrySummary = ({ items }: { readonly items: readonly RegistryItem[] }): ReactElement => {
  const averageLatency = items.length
    ? items.reduce((acc, item) => acc + item.latencyMs, 0) / items.length
    : 0;

  const healthyCount = items.filter((item) => item.healthy).length;

  return (
    <aside className="plugin-summary">
      <p>Total plugins: {items.length}</p>
      <p>Healthy plugins: {healthyCount}</p>
      <p>Average latency: {averageLatency.toFixed(0)}ms</p>
    </aside>
  );
};

export const PluginRegistryEmpty = (): ReactNode => <p>No plugins discovered yet</p>;
