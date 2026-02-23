import { useMemo } from 'react';

interface Metric { label: string; value: number; unit: string; }

interface PolicyMetricCardsProps {
  metrics: readonly Metric[];
}

const toUnit = (metric: Metric): string => `${metric.value.toLocaleString()} ${metric.unit}`;

export const PolicyMetricCards = ({ metrics }: PolicyMetricCardsProps) => {
  const visible = useMemo(() => metrics.slice(0, 6), [metrics]);
  return (
    <div>
      <h3>Run Metrics</h3>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {visible.map((metric) => (
          <article key={metric.label} style={{ border: '1px solid #ddd', padding: '0.5rem', borderRadius: 4 }}>
            <h4>{metric.label}</h4>
            <p>{toUnit(metric)}</p>
          </article>
        ))}
      </div>
    </div>
  );
};
