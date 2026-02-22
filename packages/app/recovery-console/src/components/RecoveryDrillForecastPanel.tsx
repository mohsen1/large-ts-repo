import { useRecoveryDrillForecast } from '../hooks/useRecoveryDrillForecast';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';

interface RecoveryDrillForecastPanelProps {
  readonly tenantId: string;
  readonly templates: readonly DrillTemplateRecord[];
  readonly runs: readonly DrillRunRecord[];
}

export const RecoveryDrillForecastPanel = ({ tenantId, templates, runs }: RecoveryDrillForecastPanelProps) => {
  const forecastState = useRecoveryDrillForecast({
    tenantId,
    templates,
    runs,
  });

  return (
    <section>
      <h3>Drill forecast</h3>
      <p>Signal confidence: {forecastState.avgConfidence.toFixed(2)}</p>
      <p>Risk buckets: {forecastState.warningBuckets.length}</p>
      <ol>
        {forecastState.forecast.points.slice(0, 6).map((point) => (
          <li key={`${point.runId}-${point.templateId}`}>
            {point.runId}: {point.predictedMs}ms confidence {point.confidence.toFixed(2)}
          </li>
        ))}
      </ol>
      <div>
        <strong>Top risk templates</strong>
        <ul>
          {forecastState.topRiskTemplateIds.map((templateId) => (
            <li key={templateId}>{templateId}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
