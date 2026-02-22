import { useAdaptiveOpsForecast } from '../hooks/useAdaptiveOpsForecast';
import { AdaptiveOpsForecastPanel } from '../components/AdaptiveOpsForecastPanel';
import { AdaptiveOpsCoveragePanel } from '../components/AdaptiveOpsCoveragePanel';

export interface AdaptiveOpsForecastPageProps {
  tenantId?: string;
}

export const AdaptiveOpsForecastPage = ({ tenantId = 'tenant-a' }: AdaptiveOpsForecastPageProps) => {
  const {
    input,
    setTenant,
    setHorizonMinutes,
    setMaxPoints,
    loadSummary,
    runForecast,
    executeForecast,
    clearErrors,
    forecast,
    loadingForecast,
    loadingSummary,
    historySummary,
    trend,
    topForecastActions,
    errors,
  } = useAdaptiveOpsForecast({
    tenantId,
    horizonMinutes: 60,
    maxPoints: 12,
  });

  const resetTenant = () => {
    setTenant('tenant-a');
  };

  return (
    <main className="adaptive-ops-forecast-page">
      <h1>Adaptive Forecast Console</h1>
      <AdaptiveOpsCoveragePanel
        snapshot={historySummary}
        loading={loadingSummary}
        onRefresh={loadSummary}
      />
      <AdaptiveOpsForecastPanel
        forecast={forecast}
        loading={loadingForecast}
        tenantId={input.tenantId}
        horizonMinutes={input.horizonMinutes}
        maxPoints={input.maxPoints}
        onHorizonChange={setHorizonMinutes}
        onMaxPointsChange={setMaxPoints}
        onGenerate={executeForecast}
        onResetTenant={resetTenant}
      />
      <section className="forecast-metrics">
        <h3>Top policy trend</h3>
        <ul>
          {trend.length === 0 ? (
            <li>No trend points yet</li>
          ) : (
            trend.map((record) => (
              <li key={`${record.policyId}-${record.confidence}`}>
                <strong>{record.policyId}</strong>
                <span>{record.tenantId}</span>
                <span>{record.confidence.toFixed(2)}</span>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="forecast-actions">
        <h3>Action predictions</h3>
        <ul>
          {topForecastActions.map((action) => (
            <li key={`${action.type}-${action.target}-${action.intensity}`}>
              <strong>{action.type}</strong>
              <span>{action.target}</span>
              <span>{action.intensity.toFixed(1)}</span>
              <small>{action.justification}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="action-bar">
        <button onClick={runForecast} disabled={loadingForecast}>
          Quick Forecast
        </button>
        <button onClick={loadSummary}>Refresh summary</button>
        <button onClick={clearErrors} disabled={errors.length === 0}>
          Clear messages
        </button>
      </section>
      {errors.length > 0 && (
        <section className="adaptive-ops-errors">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      )}
    </main>
  );
};
