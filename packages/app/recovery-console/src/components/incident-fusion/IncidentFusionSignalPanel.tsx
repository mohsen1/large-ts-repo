import type { RecoveryScenario, RecoverySignal } from '@domain/incident-fusion-models';
import { useMemo } from 'react';

interface Summary {
  readonly resolved: number;
  readonly aging: number;
  readonly fresh: number;
  readonly total: number;
}

export interface Props {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
  readonly scenarios: readonly RecoveryScenario[];
  readonly summary: Summary;
}

const stateColor: Record<RecoverySignal['state'], string> = {
  fresh: '#6ee7b7',
  aging: '#fcd34d',
  stale: '#fb923c',
  resolved: '#60a5fa',
};

export const IncidentFusionSignalPanel = ({ tenant, signals, scenarios, summary }: Props) => {
  const critical = useMemo(
    () => signals.filter((signal) => signal.priority === 'critical'),
    [signals],
  );

  const topActions = useMemo(
    () =>
      signals
        .toSorted((left, right) => right.severity - left.severity)
        .slice(0, 8)
        .map((signal) => `${signal.title} (${signal.state})`),
    [signals],
  );

  return (
    <article style={{ background: '#0c2237', border: '1px solid #244061', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Signal panel · {tenant}</h3>
      <p>Scenarios: {scenarios.length}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <li>Resolved: {summary.resolved}</li>
        <li>Fresh: {summary.fresh}</li>
        <li>Aging: {summary.aging}</li>
        <li>Total: {summary.total}</li>
      </ul>
      <h4>Critical signals</h4>
      <ul>
        {critical.map((signal) => (
          <li key={signal.id} style={{ color: stateColor[signal.state] }}>
            {signal.title} — severity {signal.severity.toFixed(2)}
          </li>
        ))}
      </ul>
      <h4>Top recommendations</h4>
      <ul>
        {topActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </article>
  );
};
