import { DemandSignal } from '@domain/fulfillment-orchestration-analytics';

interface FulfillmentRiskHeatmapProps {
  signals: readonly DemandSignal[];
}

export const FulfillmentRiskHeatmap = ({ signals }: FulfillmentRiskHeatmapProps) => {
  const rows = signals.slice(0, 12).map((signal) => {
        const risk = Math.max(0, 100 - signal.confidence * 100 + signal.seasonalFactor * 5);
    const color = risk > 70 ? '#b00020' : risk > 40 ? '#f57f17' : '#1b5e20';
    return (
      <div
        key={`${signal.sampleWindowStart}-${signal.sku}`}
        style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', marginBottom: '6px' }}
      >
        <span>{signal.sku}</span>
        <span style={{ color, fontWeight: 600 }}>
          {risk.toFixed(1)} risk
        </span>
      </div>
    );
  });

  return <section>{rows}</section>;
};
