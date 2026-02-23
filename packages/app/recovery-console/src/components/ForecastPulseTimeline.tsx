import type { ReactElement } from 'react';
import type { ForecastPoint } from '@domain/recovery-operations-models/forecast-matrix';

interface Props {
  readonly points: readonly ForecastPoint[];
}

interface PulseRow {
  readonly instant: string;
  readonly score: number;
  readonly risk: string;
  readonly confidence: number;
}

export const ForecastPulseTimeline = ({ points }: Props): ReactElement => {
  const rows: PulseRow[] = points
    .slice(-20)
    .map((point) => ({
      instant: point.instant,
      score: Number(point.score.toFixed(2)),
      risk: point.riskTag,
      confidence: Number(point.confidence.toFixed(2)),
    }));

  return (
    <section className="forecast-pulse-timeline">
      <h3>Forecast pulse</h3>
      <ol>
        {rows.length === 0 ? <li>No forecast points</li> : null}
        {rows.map((row) => (
          <li key={`${row.instant}-${row.score}-${row.risk}`}>
            <strong>{row.instant}</strong> score={row.score} risk={row.risk} confidence={row.confidence}
          </li>
        ))}
      </ol>
    </section>
  );
};
