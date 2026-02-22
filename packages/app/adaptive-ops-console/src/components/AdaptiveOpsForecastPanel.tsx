import { ChangeEvent } from 'react';
import { RunForecast } from '@domain/adaptive-ops-metrics';

interface AdaptiveOpsForecastPanelProps {
  forecast: RunForecast | null;
  loading: boolean;
  tenantId: string;
  horizonMinutes: number;
  maxPoints: number;
  onHorizonChange(value: number): void;
  onMaxPointsChange(value: number): void;
  onGenerate(): void;
  onResetTenant(): void;
}

const toRiskLabel = (value: number): string => `${Math.round(value * 100)}%`;

export const AdaptiveOpsForecastPanel = ({
  forecast,
  loading,
  tenantId,
  horizonMinutes,
  maxPoints,
  onHorizonChange,
  onMaxPointsChange,
  onGenerate,
  onResetTenant,
}: AdaptiveOpsForecastPanelProps) => {
  const onHorizonInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) {
      onHorizonChange(Math.max(15, Math.floor(next)));
    }
  };

  const onPointInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) {
      onMaxPointsChange(Math.max(3, Math.floor(next)));
    }
  };

  return (
    <section className="adaptive-ops-forecast-panel">
      <h3>Forecast Workspace</h3>
      <div className="forecast-controls">
        <label>
          Tenant ID
          <input value={tenantId} readOnly />
          <button type="button" onClick={onResetTenant}>
            Reset
          </button>
        </label>
        <label>
          Horizon (min):
          <input type="range" min={15} max={240} value={horizonMinutes} onChange={onHorizonInput} />
          {horizonMinutes}
        </label>
        <label>
          Max points:
          <input type="number" min={3} max={60} value={maxPoints} onChange={onPointInput} />
        </label>
        <button onClick={onGenerate} disabled={loading}>
          {loading ? 'Generating...' : 'Run forecast'}
        </button>
      </div>
      <div className="forecast-output">
        {!forecast ? (
          <p>No forecast generated</p>
        ) : (
          <div>
            <h4>{forecast.tenantId}</h4>
            <p>
              recommendation: <strong>{forecast.recommendation}</strong>
            </p>
            <ul>
              {forecast.points.map((point) => (
                <li key={`${point.timestamp}-${point.dominantPolicyId ?? 'none'}`}>
                  <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
                  <span>{toRiskLabel(point.projectedRisk)}</span>
                  <span>{point.expectedRecoveryMinutes}m</span>
                  <span>{point.dominantPolicyId ?? 'global'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
