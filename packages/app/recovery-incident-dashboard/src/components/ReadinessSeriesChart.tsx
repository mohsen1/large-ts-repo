interface ReadinessSeriesChartProps {
  readonly label: string;
  readonly criticalCount: number;
  readonly healthyCount: number;
}

type ReadinessSeriesBar = {
  readonly bucket: number;
  readonly state: 'critical' | 'ready';
  readonly ratio: number;
};

const clamp = (value: number): number => {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

const buildBars = (critical: number, healthy: number): readonly ReadinessSeriesBar[] => {
  const total = critical + healthy + 1;
  const base = clamp(total <= 0 ? 0 : healthy / total);
  const segments = new Array(5).fill(0).map((_entry, index) => {
    const bucket = index + 1;
    const ratio = Math.max(0, Math.min(1, base + index * 0.01));
    return {
      bucket,
      state: bucket <= Math.floor(base * 5) ? 'ready' : 'critical' as ReadinessSeriesBar['state'],
      ratio,
    };
  });
  return critical > 0 ? [...segments].reverse() : segments;
};

export const ReadinessSeriesChart = ({ label, criticalCount, healthyCount }: ReadinessSeriesChartProps) => {
  const bars = buildBars(criticalCount, healthyCount);
  return (
    <div className="readiness-series-chart" data-tenant={label}>
      <h4>Signal</h4>
      <ul>
        {bars.map((entry) => (
          <li
            key={`${label}-${entry.bucket}`}
            style={{
              background: entry.state === 'ready' ? '#2f8f4e' : '#8b3a3a',
              width: `${Math.round(entry.ratio * 100)}%`,
            }}
          >
            {entry.state}:{entry.bucket}
          </li>
        ))}
      </ul>
    </div>
  );
};
