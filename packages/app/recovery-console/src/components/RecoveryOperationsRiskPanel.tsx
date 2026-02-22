import { useMemo } from 'react';

export interface RecoveryOperationsRiskPanelProps {
  readonly tenant: string;
  readonly signals: readonly {
    id: string;
    severity: number;
    confidence: number;
    source: string;
  }[];
}

const bandForSeverity = (value: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (value >= 8) return 'critical';
  if (value >= 6) return 'high';
  if (value >= 4) return 'medium';
  return 'low';
};

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(4));
};

const groupedBySource = (signals: readonly { source: string }[]) => {
  const map = new Map<string, number>();
  for (const signal of signals) {
    map.set(signal.source, (map.get(signal.source) ?? 0) + 1);
  }
  return map;
};

export const RecoveryOperationsRiskPanel = ({ tenant, signals }: RecoveryOperationsRiskPanelProps) => {
  const severityAverage = average(signals.map((signal) => signal.severity));
  const confidenceAverage = average(signals.map((signal) => signal.confidence));
  const riskBand = bandForSeverity(severityAverage);
  const grouped = useMemo(() => groupedBySource(signals), [signals]);

  return (
    <section className="risk-panel">
      <h3>Tenant risk profile: {tenant}</h3>
      <dl>
        <dt>Severity average</dt>
        <dd>{severityAverage}</dd>
        <dt>Confidence average</dt>
        <dd>{confidenceAverage}</dd>
        <dt>Risk band</dt>
        <dd>{riskBand}</dd>
      </dl>

      <h4>Sources</h4>
      <ul>
        {Array.from(grouped.entries()).map(([source, count]) => (
          <li key={`${tenant}:${source}`}>
            {source}: {count}
          </li>
        ))}
      </ul>
    </section>
  );
};
