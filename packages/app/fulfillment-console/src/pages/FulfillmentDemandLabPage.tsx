import { FulfillmentIntelligenceDashboard } from '../components/FulfillmentIntelligenceDashboard';
import { useDemandForecast } from '../hooks/useDemandForecast';
import { DemandSignal } from '@domain/fulfillment-orchestration-analytics';

const makeSignals = (): readonly DemandSignal[] =>
  new Array(18).fill(0).map((_, index) => ({
    tenantId: 'lab',
    productId: 'catalog',
    sku: `signal-${index}`,
    baseDemand: 14 + index,
    observedDemand: 11 + index * 1.35,
    seasonalFactor: 0.8 + (index % 5) * 0.04,
    confidence: 0.52 + (index % 10) * 0.04,
    sampleWindowStart: new Date(Date.now() + index * 120_000).toISOString(),
    sampleWindowEnd: new Date(Date.now() + (index + 1) * 120_000).toISOString(),
    source: 'partner',
  }));

export const FulfillmentDemandLabPage = () => {
  const signals = makeSignals();
  const forecast = useDemandForecast(signals);
  return (
    <main style={{ padding: '20px' }}>
      <h2>Demand Lab</h2>
      <p>SKU Count: {forecast.bucketCount}</p>
      <p>Avg Base: {forecast.averageBase}</p>
      <p>Avg Observed: {forecast.averageObserved}</p>
      <p>Confidence: {forecast.totalConfidence}</p>
      <FulfillmentIntelligenceDashboard tenantId={forecast.tenantId} productId="catalog" />
    </main>
  );
};
