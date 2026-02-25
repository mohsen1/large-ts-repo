import { memo, type ReactElement, useMemo } from 'react';

export interface AnalyticsMetricCardProps {
  readonly title: string;
  readonly value: number;
  readonly max: number;
  readonly trend: readonly number[];
  readonly label: string;
}

interface MetricChipProps {
  readonly value: number;
  readonly label: string;
}

const MetricChip = memo(({ value, label }: MetricChipProps): ReactElement => {
  const tone = value >= 90 ? 'good' : value >= 60 ? 'warn' : 'bad';
  return (
    <span className={`metric-chip ${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
});

export const AnalyticsMetricCard = ({
  title,
  value,
  max,
  trend,
  label,
}: AnalyticsMetricCardProps): ReactElement => {
  const ratio = Math.max(0, Math.min(1, value / max));
  const normalizedTrend = useMemo(
    () => trend.toSorted((left, right) => right - left),
    [trend],
  );
  const direction = useMemo(() => (normalizedTrend.at(0) ?? 0) - (normalizedTrend.at(-1) ?? 0), [normalizedTrend]);
  const chart = normalizedTrend
    .map((entry) => `${Math.max(0, entry).toFixed(1)}%`)
    .join(' > ');

  return (
    <article className="analytics-metric-card">
      <header>
        <h3>{title}</h3>
        <span>{Math.round(ratio * 100)}%</span>
      </header>
      <p>{label}</p>
      <section>
        <MetricChip value={value} label="current" />
        <MetricChip value={Math.round(direction * 100)} label="delta" />
        <MetricChip value={normalizedTrend.length} label="samples" />
      </section>
      <code>{chart}</code>
    </article>
  );
};
