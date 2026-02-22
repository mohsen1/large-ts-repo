import { HealthSnapshot } from '@domain/adaptive-ops-metrics';

interface AdaptiveOpsCoveragePanelProps {
  snapshot: HealthSnapshot | null;
  loading: boolean;
  onRefresh(): void;
}

export const AdaptiveOpsCoveragePanel = ({ snapshot, loading, onRefresh }: AdaptiveOpsCoveragePanelProps) => {
  const label =
    snapshot?.riskTier === 'critical'
      ? 'risk-critical'
      : snapshot?.riskTier === 'attention'
        ? 'risk-attention'
        : 'risk-safe';

  return (
    <section className="adaptive-ops-coverage">
      <header>
        <h3>Adaptive Health</h3>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh summary'}
        </button>
      </header>
      {!snapshot ? (
        <p>No snapshot available</p>
      ) : (
        <div className="coverage-grid">
          <article>
            <p>Tenant</p>
            <strong>{snapshot.tenantId}</strong>
          </article>
          <article>
            <p>Run</p>
            <strong>{snapshot.runId}</strong>
          </article>
          <article>
            <p>Score</p>
            <strong>{snapshot.score.toFixed(2)}</strong>
          </article>
          <article>
            <p>Risk</p>
            <strong className={label}>{snapshot.riskTier}</strong>
          </article>
          <article>
            <p>Details</p>
            <small>{snapshot.details}</small>
          </article>
        </div>
      )}
    </section>
  );
};
