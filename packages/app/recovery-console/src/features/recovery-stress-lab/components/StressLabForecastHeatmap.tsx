import { type ReactElement, useMemo, useState } from 'react';
import { type ForecastPoint, type ForecastSummary, type Recommendation } from '@domain/recovery-stress-lab-intelligence';

interface HeatmapProps {
  readonly summary: ForecastSummary | null;
  readonly recommendations: readonly Recommendation[];
}

interface HeatCell {
  readonly value: ForecastPoint;
  readonly active: boolean;
}

type SeverityBucket = 'very-high' | 'high' | 'medium' | 'low' | 'very-low';

const bucketFor = (value: number): SeverityBucket => {
  if (value >= 0.85) return 'very-high';
  if (value >= 0.65) return 'high';
  if (value >= 0.45) return 'medium';
  if (value >= 0.25) return 'low';
  return 'very-low';
};

const severityColor = {
  'very-high': '#ff4d4f',
  high: '#fadb14',
  medium: '#fa8c16',
  low: '#52c41a',
  'very-low': '#52c41a99',
} as const;

export const StressLabForecastHeatmap = ({ summary, recommendations }: HeatmapProps): ReactElement => {
  const points = summary?.points ?? [];
  const [phase, setPhase] = useState<string>('all');
  const filtered = useMemo(
    () =>
      points.filter((point) => {
        if (phase === 'all') {
          return true;
        }

        const recs = recommendations.filter((recommendation) =>
          recommendation.phase === phase && recommendation.affectedSignals.includes(point.signalId),
        );
        return recs.length > 0;
      }),
    [points, recommendations, phase],
  );

  const heatCells = filtered
    .map<HeatCell>((point) => ({
      value: point,
      active: point.forecast > 0.5,
    }))
    .toSorted((left, right) => right.value.forecast - left.value.forecast);

  const phaseOptions = ['all', ...new Set(recommendations.map((recommendation) => recommendation.phase))];

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3>Forecast Heatmap</h3>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Phase
          <select value={phase} onChange={(event) => setPhase(event.target.value)}>
            {phaseOptions.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
        </label>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {heatCells.map((cell) => {
          const level = bucketFor(cell.value.forecast);
          return (
            <div
              key={cell.value.signalId}
              style={{
                borderRadius: 8,
                padding: 10,
                border: `1px solid ${severityColor[level]}`,
                background: severityColor[level],
                opacity: cell.active ? 1 : 0.6,
                color: '#111',
              }}
            >
              <p style={{ margin: '0 0 6px' }}>{cell.value.signalId}</p>
              <p style={{ margin: 0 }}>{cell.value.forecast.toFixed(3)}</p>
              <p style={{ margin: 0 }}>conf {cell.value.confidence.toFixed(2)}</p>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0 }}>Point count: {heatCells.length}</p>
    </section>
  );
};

export default StressLabForecastHeatmap;
