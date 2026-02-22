import { useMemo } from 'react';
import type { UseRecoveryOperationsIntelligenceResult } from '../hooks/useRecoveryOperationsIntelligence';

export interface RecoveryOperationsPolicyDashboardProps {
  readonly data: Omit<UseRecoveryOperationsIntelligenceResult, 'ingestSignals' | 'clear' | 'error'>;
  readonly onRun: () => void;
  readonly onClear: () => void;
}

export const RecoveryOperationsPolicyDashboard = ({ data, onRun, onClear }: RecoveryOperationsPolicyDashboardProps) => {
  const isHealthy = useMemo(() => {
    const critical = data.portfolios.some((portfolio) => portfolio.includes('critical'));
    if (critical) return false;
    return data.signalCount < 60;
  }, [data.portfolios, data.signalCount]);

  return (
    <section className="policy-dashboard">
      <header>
        <h2>Recovery policy operations</h2>
        <p>Tenant: {data.selectedTenant}</p>
      </header>

      <ul>
        <li>Signals loaded: {data.signalCount}</li>
        <li>Policy health: {isHealthy ? 'healthy' : 'degraded'}</li>
        <li>Route summary: {data.routeSummary ?? 'pending'}</li>
        <li>Timeline summary: {data.timelineSummary ?? 'pending'}</li>
      </ul>

      <div className="policy-actions">
        <button type="button" onClick={onRun} disabled={data.signalCount === 0}>
          Evaluate policies
        </button>
        <button type="button" onClick={onClear}>
          Reset intelligence
        </button>
      </div>

      <div>
        <h3>Portfolio snapshot</h3>
        {data.portfolios.length === 0 ? (
          <p>No computed portfolio yet</p>
        ) : (
          <ul>
            {data.portfolios.map((portfolio, index) => (
              <li key={`${portfolio}-${index}`}>{portfolio}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
