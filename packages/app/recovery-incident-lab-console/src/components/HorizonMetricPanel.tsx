import { useMemo, type ReactElement } from 'react';
import { type JsonLike } from '@domain/recovery-horizon-engine';

interface MetricEntry {
  readonly runId: string;
  readonly metric: string;
  readonly value: number | string;
}

interface HeatCell {
  readonly stage: string;
  readonly label: string;
  readonly active: boolean;
}

interface Props {
  readonly metrics: readonly MetricEntry[];
  readonly windowLabels: readonly string[];
  readonly note: string;
  readonly onCopy: (value: string) => void;
}

const colorForValue = (value: number): string => {
  if (value >= 100) {
    return 'var(--critical)';
  }
  if (value >= 50) {
    return 'var(--warning)';
  }
  return 'var(--ok)';
};

const StageHeatmap = ({ labels }: { readonly labels: readonly string[] }): ReactElement => {
  const cells = labels.map((label, index) => {
    const active = index % 2 === 0;
    const value = Math.max(1, index * 13 + label.length);
    return {
      stage: label,
      label: `${label} • ${value}`,
      active,
    } satisfies HeatCell;
  });

  return (
    <div className="horizon-heatmap">
      {cells.map((cell) => (
        <div
          key={`${cell.stage}-${cell.label}`}
          className={`heat-cell ${cell.active ? 'active' : 'idle'}`}
          style={{ borderColor: colorForValue(cell.label.length) }}
        >
          {cell.label}
        </div>
      ))}
    </div>
  );
};

const MetricRows = ({ metrics }: { readonly metrics: readonly MetricEntry[] }): ReactElement => {
  return (
    <table>
      <thead>
        <tr>
          <th>Run</th>
          <th>Metric</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((entry) => (
          <tr key={`${entry.runId}-${entry.metric}`}>
            <td>{entry.runId}</td>
            <td>{entry.metric}</td>
            <td>{String(entry.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const asEntries = (value: JsonLike): MetricEntry[] =>
  Object.entries(value ?? {}).map(([metric, metricValue]) => ({
    runId: `run-${metric}`,
    metric,
    value: typeof metricValue === 'number' ? metricValue : JSON.stringify(metricValue),
  }));

export const HorizonMetricPanel = ({ metrics, windowLabels, note, onCopy }: Props): ReactElement => {
  const entries = useMemo(() => metrics.flatMap((metric) => asEntries({
    [metric.metric]: metric.value,
  })), [metrics]);

  const copy = () => {
    const payload = JSON.stringify(
      {
        note,
        entries: entries.length,
        labels: windowLabels,
      },
      null,
      2,
    );
    onCopy(payload);
  };

  return (
    <section className="horizon-metrics">
      <h2>Horizon Metrics</h2>
      <p>{note}</p>
      <button type="button" onClick={copy}>
        Copy metric payload
      </button>
      <div>
        <StageHeatmap labels={windowLabels} />
        <MetricRows metrics={entries} />
      </div>
    </section>
  );
};
