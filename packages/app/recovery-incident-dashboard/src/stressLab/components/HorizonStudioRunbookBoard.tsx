import { useMemo } from 'react';
import type { HorizonStudioStatus } from '../services/horizonStudioService';
import type { PluginStage } from '@domain/recovery-horizon-engine';

type RunbookBoardProps = {
  readonly status: HorizonStudioStatus;
  readonly onSignalKind: (kind: PluginStage | 'all') => void;
  readonly selected: PluginStage | 'all';
};

const byTenants = (status: HorizonStudioStatus) => {
  const buckets = status.signals.reduce<Record<string, number>>((acc, signal) => {
    const tenant = signal.input.tenantId;
    acc[tenant] = (acc[tenant] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(buckets)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([tenant, count]) => ({ tenant, count }));
};

export const HorizonStudioRunbookBoard = ({ status, onSignalKind, selected }: RunbookBoardProps) => {
  const rows = useMemo(() => {
    const signals = status.signals;
    const severity = {
      low: signals.filter((entry) => entry.severity === 'low').length,
      medium: signals.filter((entry) => entry.severity === 'medium').length,
      high: signals.filter((entry) => entry.severity === 'high').length,
      critical: signals.filter((entry) => entry.severity === 'critical').length,
    };

    return {
      totalSignals: signals.length,
      totalPlans: status.plans.length,
      severity,
      byTenants: byTenants(status),
    };
  }, [status]);

  return (
    <section className="horizon-studio-runbook">
      <h3>Runbook Board</h3>

      <p>Total Plans: {rows.totalPlans}</p>
      <p>Total Signals: {rows.totalSignals}</p>

      <div className="severity-grid">
        <span>low: {rows.severity.low}</span>
        <span>medium: {rows.severity.medium}</span>
        <span>high: {rows.severity.high}</span>
        <span>critical: {rows.severity.critical}</span>
      </div>

      <div className="stage-buttons">
        <button type="button" onClick={() => onSignalKind('all')} className={selected === 'all' ? 'selected' : undefined}>
          all
        </button>
        <button type="button" onClick={() => onSignalKind('ingest')} className={selected === 'ingest' ? 'selected' : undefined}>
          ingest
        </button>
        <button type="button" onClick={() => onSignalKind('analyze')} className={selected === 'analyze' ? 'selected' : undefined}>
          analyze
        </button>
        <button type="button" onClick={() => onSignalKind('resolve')} className={selected === 'resolve' ? 'selected' : undefined}>
          resolve
        </button>
        <button type="button" onClick={() => onSignalKind('optimize')} className={selected === 'optimize' ? 'selected' : undefined}>
          optimize
        </button>
        <button type="button" onClick={() => onSignalKind('execute')} className={selected === 'execute' ? 'selected' : undefined}>
          execute
        </button>
      </div>

      <ul>
        {rows.byTenants.map((entry) => (
          <li key={entry.tenant}>
            <strong>{entry.tenant}</strong>
            <span>{entry.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
