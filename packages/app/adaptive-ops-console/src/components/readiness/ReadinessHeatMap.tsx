import { useMemo } from 'react';

interface ReadinessHeatMapProps {
  values: readonly number[];
  title: string;
  max: number;
}

const normalize = (value: number, max: number): number => {
  if (!Number.isFinite(value) || max <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
};

export const ReadinessHeatMap = ({ values, title, max }: ReadinessHeatMapProps) => {
  const rows = useMemo(() => {
    return values.map((value, index) => ({
      id: index,
      value,
      intensity: normalize(value, max),
      bucket: `b${index}`,
    }));
  }, [values, max]);

  return (
    <section className="readiness-heatmap">
      <h3>{title}</h3>
      <div className="heatmap-grid">
        {rows.map((row) => {
          const color = row.intensity > 0.75 ? '#d64545' : row.intensity > 0.5 ? '#f0a202' : row.intensity > 0.25 ? '#4c9aff' : '#65c17a';
          return (
            <div
              className="heatmap-cell"
              key={`${row.bucket}-${row.value}`}
              style={{ backgroundColor: color }}
              title={`${row.bucket}: ${row.value}`}
            >
              <span>{row.bucket}</span>
              <strong>{row.value.toFixed(1)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
};

