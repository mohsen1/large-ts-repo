import { useMemo, useState, type ReactElement } from 'react';
import type { LatticeMetricSample } from '@domain/recovery-lattice';

type MetricItem = {
  readonly name: string;
  readonly unit: string;
  readonly value: number;
  readonly severity: LatticeMetricSample['severity'];
  readonly tags: readonly string[];
  readonly route: string;
};

type MetricMode = 'raw' | 'normalized';

type Props = {
  readonly samples: readonly LatticeMetricSample[];
  readonly limit?: number;
  readonly onPin: (sampleName: string) => void;
  readonly pinned: readonly string[];
};

const formatValue = (value: number, unit: string): string => {
  if (unit === 'percent') {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (unit === 'bytes') {
    return `${Math.round(value / 1_000_000)}MB`;
  }
  return `${value.toFixed(2)} ${unit}`;
};

const severityWeight = (severity: MetricItem['severity']): number => {
  return severity === 'critical' ? 3 : severity === 'warning' ? 2 : severity === 'stable' ? 1 : 0;
};

const byRoute = (samples: readonly LatticeMetricSample[]): Map<string, MetricItem[]> => {
  const map = new Map<string, MetricItem[]>();
  for (const sample of samples) {
    const key = sample.name;
    const list = map.get(key) ?? [];
    list.push({
      name: sample.name,
      unit: sample.unit,
      value: sample.value,
      severity: sample.severity,
      tags: [...sample.tags],
      route:
        typeof sample.context === 'object' &&
        sample.context !== null &&
        'route' in sample.context
          ? String((sample.context as { route?: unknown }).route ?? sample.tenantId)
          : String(sample.tenantId),
    });
    map.set(key, list);
  }
  return map;
};

export const LatticeMetricsPanel = ({
  samples,
  limit = 10,
  onPin,
  pinned,
}: Props): ReactElement => {
  const [mode, setMode] = useState<MetricMode>('raw');
  const grouped = useMemo(() => byRoute(samples), [samples]);
  const entries = useMemo(
    () =>
      [...grouped.entries()]
        .map(([name, items]) => ({
          name,
          unit: items[0]?.unit ?? 'count',
          latest: items[items.length - 1],
          total: items.length,
          severity: items.reduce((acc, current) => acc + severityWeight(current.severity), 0) / Math.max(1, items.length),
          items,
        }))
        .toSorted((left, right) => right.severity - left.severity)
        .slice(0, limit),
    [grouped, limit],
  );

  return (
    <section className="lattice-metrics-panel">
      <header>
        <h3>Metric Stream</h3>
        <label>
          mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as MetricMode)}
          >
            <option value="raw">Raw</option>
            <option value="normalized">Normalized</option>
          </select>
        </label>
      </header>

      <ul className="metric-list">
        {entries.map((entry) => (
          <li key={entry.name} className={`metric-item severity-${entry.severity >= 2 ? 'high' : 'low'}`}>
            <header>
              <strong>{entry.name}</strong>
              <button type="button" onClick={() => onPin(entry.name)}>
                {pinned.includes(entry.name) ? 'unpin' : 'pin'}
              </button>
            </header>
            <p>
              latest: {formatValue(entry.latest?.value ?? 0, entry.unit)} ({entry.latest?.severity})
            </p>
            <p>samples: {entry.total}</p>
            <p>mode: {mode}</p>
            <p>
              route: {entry.latest?.route}
            </p>
          </li>
        ))}
        {entries.length === 0 ? <li className="empty">No metrics in stream</li> : null}
      </ul>
    </section>
  );
};
