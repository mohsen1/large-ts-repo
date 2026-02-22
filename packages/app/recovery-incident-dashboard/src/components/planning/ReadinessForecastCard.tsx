import { useMemo } from 'react';
import type { ReadinessWorkspaceState } from '../../hooks/useRecoveryReadinessWorkspace';

interface ReadinessForecastCardProps {
  readonly label: string;
  readonly state: ReadinessWorkspaceState;
  readonly onTenant: (tenantId: string) => void;
}

export const ReadinessForecastCard = ({ label, state, onTenant }: ReadinessForecastCardProps) => {
  const topMetrics = useMemo(() => [...state.metrics]
    .sort((left, right) => right.openRatio - left.openRatio)
    .slice(0, 3), [state.metrics]);

  return (
    <article className="readiness-forecast">
      <header>
        <h2>{label}</h2>
        <small>{state.snapshotLabel}</small>
      </header>
      <p>Tenants: {state.metrics.length}</p>
      <div>
        {topMetrics.map((metric) => (
          <button
            key={metric.tenantId}
            onClick={() => onTenant(metric.tenantId)}
            type="button"
            className={state.selectedTenant === metric.tenantId ? 'selected-tenant' : ''}
          >
            {metric.tenantId}: {(metric.openRatio * 100).toFixed(1)}%
            {' '}
            ({metric.incidentCount}/{metric.runCount})
          </button>
        ))}
      </div>
      <ul>
        {state.signals.map((signal) => (
          <li key={signal.incidentId}>
            {signal.incidentId}
            {' '}
            {signal.topSignals.join(', ')}
            {' '}
            ({signal.signalDensity})
          </li>
        ))}
      </ul>
    </article>
  );
};
