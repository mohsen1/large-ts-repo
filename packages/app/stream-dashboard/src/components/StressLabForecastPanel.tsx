import { StressLabAnalytics } from '../hooks/useStressLabAnalytics';

export interface StressLabForecastPanelProps {
  analytics: StressLabAnalytics | null;
}

export function StressLabForecastPanel({ analytics }: StressLabForecastPanelProps) {
  if (!analytics) {
    return (
      <section>
        <h3>Forecast</h3>
        <p>Waiting for plan data</p>
      </section>
    );
  }

  const topSignals = analytics.riskSummary.summary.slice(0, 3);
  return (
    <section>
      <h3>Forecast</h3>
      <p>Trend: {analytics.forecastTrend}</p>
      <p>Peak: {analytics.forecastPeak}</p>
      <p>Urgency: {analytics.riskSummary.urgency}</p>
      <p>Simulation risk: {analytics.report.workflow.risk.toFixed(3)}</p>
      <ul>
        {topSignals.map((entry, index) => (
          <li key={`${index}-${entry}`}>{entry}</li>
        ))}
      </ul>
      {analytics.metricDiff ? (
        <p>Compared drift: {analytics.metricDiff.summary.driftScore.toFixed(2)}</p>
      ) : (
        <p>Metric comparison unavailable</p>
      )}
    </section>
  );
}
