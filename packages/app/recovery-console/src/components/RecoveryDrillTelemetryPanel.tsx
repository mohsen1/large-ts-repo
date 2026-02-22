import { useMemo } from 'react';

import { useRecoveryDrillTelemetry } from '../hooks/useRecoveryDrillTelemetry';

interface RecoveryDrillTelemetryPanelProps {
  readonly tenant: string;
}

export const RecoveryDrillTelemetryPanel = ({ tenant }: RecoveryDrillTelemetryPanelProps) => {
  const { loading, digest, timeline, riskByTenant, modeBreakdown, refresh } = useRecoveryDrillTelemetry({ tenant });

  const riskRows = useMemo(() => riskByTenant.map((item) => (
    <li key={item.tenantId}>
      {item.tenantId}: avgRisk {item.avgRisk} critical {item.criticalCount}
    </li>
  )), [riskByTenant]);

  const modeRows = useMemo(() => {
    const entries = Array.from(modeBreakdown.entries());
    return entries.map(([mode, value]) => (
      <li key={mode}>
        {mode}: count={value.count} success={value.success.toFixed(4)}
      </li>
    ));
  }, [modeBreakdown]);

  return (
    <section className="drill-telemetry-panel">
      <header>
        <h3>Recovery Drill Telemetry</h3>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>
      <p>Loading: {String(loading)}</p>
      <p>Digest: {digest}</p>
      <p>Timeline points: {timeline.totalPoints}</p>
      <p>Trend: {timeline.trend}</p>
      <p>Risk span: {timeline.minRisk} - {timeline.maxRisk}</p>
      <ul>{riskRows}</ul>
      <ul>{modeRows}</ul>
    </section>
  );
};
