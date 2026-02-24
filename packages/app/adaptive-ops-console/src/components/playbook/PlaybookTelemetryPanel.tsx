import { HealthSnapshot } from '@domain/adaptive-ops-metrics';
import { RunForecast } from '@domain/adaptive-ops-metrics';

interface PlaybookTelemetryPanelProps {
  snapshot: HealthSnapshot | null;
  forecast: RunForecast | null;
  metricLabels: readonly string[];
}

const safeValue = (value: number | undefined) => Number.isFinite(value ?? NaN) ? (value as number).toFixed(2) : '0.00';

export const PlaybookTelemetryPanel = ({ snapshot, forecast, metricLabels }: PlaybookTelemetryPanelProps) => {
  const labels = metricLabels.length > 0 ? metricLabels : ['none'];
  const riskColor = snapshot?.riskTier === 'critical' ? 'risk-critical' : snapshot?.riskTier === 'attention' ? 'risk-attention' : 'risk-safe';

  return (
    <section className="playbook-telemetry">
      <h3>Telemetry</h3>
      <dl>
        <dt>Risk tier</dt>
        <dd className={riskColor}>{snapshot?.riskTier ?? 'n/a'}</dd>

        <dt>Snapshot score</dt>
        <dd>{snapshot ? safeValue(snapshot.score) : 'n/a'}</dd>

        <dt>Snapshot tenant</dt>
        <dd>{snapshot?.tenantId ?? 'n/a'}</dd>

        <dt>Forecast horizon points</dt>
        <dd>{forecast?.points.length ?? 0}</dd>
      </dl>

      <section className="forecast">
        <h4>Forecast</h4>
        {!forecast ? (
          <p>not computed yet</p>
        ) : (
          <ul>
            {forecast.points.slice(0, 6).map((point) => (
              <li key={`${point.timestamp}-${point.dominantPolicyId}`}>
                <strong>{point.timestamp}</strong>
                <span>risk {safeValue(point.projectedRisk)}</span>
                <span>recovery {point.expectedRecoveryMinutes}m</span>
                <span>policy {point.dominantPolicyId ?? 'n/a'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>Signals</h4>
        <ul>
          {labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
