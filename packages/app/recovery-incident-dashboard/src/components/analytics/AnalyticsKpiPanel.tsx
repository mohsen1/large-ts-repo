import { useMemo } from 'react';

export interface AnalyticsKpiPanelProps {
  readonly tenantId: string;
  readonly totalSignals: number;
  readonly alertScore: number;
  readonly recommendationCount: number;
  readonly criticalAlerts: number;
}

export const AnalyticsKpiPanel = ({
  tenantId,
  totalSignals,
  alertScore,
  recommendationCount,
  criticalAlerts,
}: AnalyticsKpiPanelProps) => {
  const grade = useMemo(() => {
    if (alertScore >= 0.8) {
      return 'critical';
    }
    if (alertScore >= 0.6) {
      return 'high';
    }
    if (alertScore >= 0.35) {
      return 'medium';
    }
    return 'low';
  }, [alertScore]);

  const scoreText = useMemo(() => `${Math.round(alertScore * 100)} / 100`, [alertScore]);
  const signalHealth = useMemo(() => Math.max(0, Math.round(100 - alertScore * 100)), [alertScore]);

  return (
    <section className="analytics-kpi-panel">
      <h2>Incident Signal Analytics</h2>
      <p>Tenant: {tenantId}</p>
      <ul className="analytics-kpi-grid">
        <li>
          <strong>Total Signals</strong>
          <span>{totalSignals}</span>
        </li>
        <li>
          <strong>Alert Score</strong>
          <span>{scoreText}</span>
        </li>
        <li>
          <strong>Risk Grade</strong>
          <span>{grade}</span>
        </li>
        <li>
          <strong>Critical Alerts</strong>
          <span>{criticalAlerts}</span>
        </li>
        <li>
          <strong>Signal Health</strong>
          <span>{signalHealth}%</span>
        </li>
        <li>
          <strong>Recommendations</strong>
          <span>{recommendationCount}</span>
        </li>
      </ul>
    </section>
  );
};
