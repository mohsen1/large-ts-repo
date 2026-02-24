import { useFulfillmentIntelligence } from '../hooks/useFulfillmentIntelligence';
import { ForecastSignalTimeline } from './ForecastSignalTimeline';
import { ThroughputGauge } from './ThroughputGauge';
import { FulfillmentRiskHeatmap } from './FulfillmentRiskHeatmap';
import { ForecastWindowRibbon } from './ForecastWindowRibbon';
import { useDemandForecast } from '../hooks/useDemandForecast';
import { ScenarioSummaryPanel } from './ScenarioSummaryPanel';
interface FulfillmentIntelligenceDashboardProps {
  tenantId: string;
  productId: string;
}

export const FulfillmentIntelligenceDashboard = ({ tenantId, productId }: FulfillmentIntelligenceDashboardProps) => {
  const { loading, lastRun, signals, error, run } = useFulfillmentIntelligence(tenantId, {
    tenantId,
    productId,
    horizonMinutes: 240,
    minConfidence: 0.72,
  });

  const demand = useDemandForecast(signals);
  const trend = signals.map((signal) => Number((signal.observedDemand - signal.baseDemand).toFixed(2)));
  const score = lastRun?.score ?? 0;
  const scenario = lastRun?.topScenario?.id ?? 'pending';

  return (
    <section style={{ display: 'grid', gap: '12px' }}>
      <header>
        <h2>Fulfillment Intelligence Console</h2>
        <p style={{ margin: '0', color: '#777' }}>
          Tenant: <strong>{tenantId}</strong> • Product: <strong>{productId}</strong> • Status: <strong>{loading ? 'Running' : error ? 'Error' : lastRun ? 'Complete' : 'Idle'}</strong>
        </p>
      </header>
      <ThroughputGauge score={score} scenarioId={scenario} />
      <ForecastSignalTimeline points={trend} />
      <ForecastWindowRibbon windows={signals} />
      <FulfillmentRiskHeatmap signals={signals} />
      <ScenarioSummaryPanel
        score={score}
        signalCount={signals.length}
        tenantId={tenantId}
        averageDemand={demand.averageObserved}
      />
      <button
        type="button"
        onClick={() => void run({
          productId,
          signals: signals.slice(0, 8).map((signal) => ({
            tenantId,
            productId,
            sku: signal.sku,
            baseDemand: signal.baseDemand,
            observedDemand: signal.observedDemand,
            seasonalFactor: signal.seasonalFactor,
            confidence: signal.confidence,
            sampleWindowStart: signal.sampleWindowStart,
            sampleWindowEnd: signal.sampleWindowEnd,
            source: signal.source,
          })),
          windows: new Array(8).fill(0).map((_, index) => ({
            slotStart: new Date(Date.now() + index * 900_000).toISOString(),
            slotEnd: new Date(Date.now() + (index + 1) * 900_000).toISOString(),
            forecastUnits: index * 10,
            demandVariance: 0.02 * index,
            backlogRisk: index % 2 === 0 ? 0.2 : 0.8,
            confidence: 0.8,
          })),
          targetSla: 0.72,
        })}
      >
        Run live strategy
      </button>
      {error ? <div style={{ color: 'red' }}>{error}</div> : null}
      {lastRun ? <pre>{JSON.stringify(lastRun, null, 2)}</pre> : null}
    </section>
  );
};
