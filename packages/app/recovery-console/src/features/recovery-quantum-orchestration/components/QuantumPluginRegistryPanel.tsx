import { useMemo } from 'react';
import { QuantumPluginDirectory } from '@shared/orchestration-kernel';
import type { QuantumPluginMetric, QuantumWorkspace, QuantumTelemetryPoint } from '../types';

interface QuantumPluginRegistryPanelProps {
  readonly workspace: QuantumWorkspace;
  readonly metrics: readonly QuantumPluginMetric[];
  readonly onSelect?: (tag: string) => void;
}

const normalizeTag = (metric: QuantumPluginMetric) => metric.pluginRoute.split(':').at(-1) ?? 'none';

const aggregateByTag = (metrics: readonly QuantumPluginMetric[]) => {
  const buckets = new Map<string, number>();
  for (const metric of metrics) {
    const tag = normalizeTag(metric);
    buckets.set(tag, (buckets.get(tag) ?? 0) + 1);
  }
    return [...buckets.entries()]
      .map(([key, count]) => ({ tag: key, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 24);
};

const metricsToRows = (points: readonly QuantumTelemetryPoint[]) =>
  points.reduce<Record<string, number>>((acc, point) => {
    const key = point.tags[0] ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + point.value;
    return acc;
  }, {});

export const QuantumPluginRegistryPanel = ({ workspace, metrics, onSelect }: QuantumPluginRegistryPanelProps) => {
  const rows = useMemo(() => aggregateByTag(metrics), [metrics]);
  const totals = useMemo(
    () =>
      metricsToRows(
        metrics.map((entry) => ({
          at: entry.pluginId,
          key: entry.pluginId,
          value: entry.score,
          tags: [entry.health],
        })),
      ),
    [metrics],
  );
  const selected = useMemo(() => rows.find((row) => row.count > 1)?.tag, [rows]);

  const directory = useMemo(() => new QuantumPluginDirectory([] as const), []);
  const namespaceCount = directory.namespaces.length;

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Plugin registry</h3>
      <p>{`workspace: ${workspace.workspaceId}`}</p>
      <p>{`plugins discovered: ${rows.length}`}</p>
      <p>{`active route seeds: ${Object.keys(totals).length}`}</p>
      <p>{`default directory size: ${namespaceCount}`}</p>
      <p>{`most used: ${selected ?? 'n/a'}`}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.tag}>
            <button
              type="button"
              onClick={() => {
                onSelect?.(row.tag);
              }}
            >
              {`${row.tag} = ${row.count}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
