interface ForecastSignalTimelineProps {
  points: readonly number[];
}

export const ForecastSignalTimeline = ({ points }: ForecastSignalTimelineProps) => (
  <section>
    <h3>Forecast Delta Trend</h3>
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {points.map((point, index) => (
        <li key={`${point}-${index}`} style={{ marginBottom: '4px' }}>
          {index}: {point >= 0 ? '+' : ''}{point.toFixed(2)}
        </li>
      ))}
    </ul>
  </section>
);
