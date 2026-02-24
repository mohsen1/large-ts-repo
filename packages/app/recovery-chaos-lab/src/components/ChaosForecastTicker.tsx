import { useMemo } from 'react';
import type { ForecastSeries } from '../hooks/useChaosForecast';

export interface ChaosForecastTickerProps {
  readonly title: string;
  readonly series: ForecastSeries;
  readonly precision?: number;
}

function renderBars(points: readonly { readonly value: number; readonly point: string; readonly confidence: number }[]) {
  return points.map((point) => {
    const width = Math.min(100, Math.round(point.value * 100));
    const opacity = Math.min(1, point.confidence);
    return {
      point: point.point,
      width,
      opacity
    };
  });
}

export function ChaosForecastTicker({ title, series, precision = 2 }: ChaosForecastTickerProps) {
  const bars = useMemo(
    () => renderBars(series.points),
    [series.points]
  );

  return (
    <article className="chaos-forecast-ticker">
      <h4>{title}</h4>
      <dl>
        <dt>range</dt>
        <dd>
          {series.min.toFixed(precision)} .. {series.max.toFixed(precision)}
        </dd>
      </dl>
      <ul className="forecast-bars">
        {bars.map((bar) => (
          <li key={bar.point} style={{ opacity: bar.opacity }}>
            <i style={{ width: `${bar.width}%` }} />
            <small>{bar.point}</small>
          </li>
        ))}
      </ul>
    </article>
  );
}
