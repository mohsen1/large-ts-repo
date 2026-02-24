import { useMemo } from 'react';
import type { ReadinessLabHeatmapCell } from '../types';

interface ReadinessLabHeatmapProps {
  readonly cells: ReadonlyArray<ReadinessLabHeatmapCell>;
  readonly namespace: string;
}

const cellColor = (score: number): string => {
  if (score >= 7) {
    return 'var(--warning)';
  }
  if (score >= 4) {
    return 'var(--alert)';
  }
  return 'var(--safe)';
};

export const ReadinessLabHeatmap = ({ cells, namespace }: ReadinessLabHeatmapProps) => {
  const byBucket = useMemo(() => {
    return cells.map((cell) => ({
      key: cell.coordinate,
      style: {
        background: cellColor(cell.score),
      },
      text: `${cell.count} × ${cell.score}`,
    }));
  }, [cells]);

  return (
    <section className="readiness-lab-heatmap">
      <h3>{`Heatmap (${namespace})`}</h3>
      <div className="heatmap-grid">
        {byBucket.map((entry) => (
          <span key={entry.key} style={{ backgroundColor: entry.style.background, padding: 6, margin: 4 }} title={entry.key}>
            {entry.text}
          </span>
        ))}
      </div>
    </section>
  );
};
