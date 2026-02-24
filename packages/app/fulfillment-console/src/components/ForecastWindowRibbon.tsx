import { DemandSignal } from '@domain/fulfillment-orchestration-analytics';

interface ForecastWindowRibbonProps {
  windows: readonly DemandSignal[];
}

export const ForecastWindowRibbon = ({ windows }: ForecastWindowRibbonProps) => {
  return (
    <section style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
      {windows.slice(0, 10).map((window) => {
        const tone = window.confidence >= 0.8 ? '#2e7d32' : window.confidence >= 0.6 ? '#f9a825' : '#c62828';
        return (
          <div
            key={`${window.sampleWindowStart}-${window.sku}`}
            style={{
              minWidth: '120px',
              border: '1px solid #222',
              borderLeft: `4px solid ${tone}`,
              padding: '8px',
            }}
          >
            <div>{window.sku}</div>
            <small>{window.seasonalFactor.toFixed(2)}</small>
            <strong style={{ color: tone }}>{(window.confidence * 100).toFixed(1)}%</strong>
          </div>
        );
      })}
    </section>
  );
};
