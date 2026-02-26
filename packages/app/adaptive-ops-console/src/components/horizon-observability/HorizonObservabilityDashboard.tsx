import type { ObservabilitySummary } from '@service/recovery-horizon-observability-orchestrator';

interface HorizonObservabilityDashboardProps {
  readonly tenantId: string;
  readonly profile: string;
  readonly summaries: readonly ObservabilitySummary[];
  readonly trace: readonly string[];
  readonly error?: string | null;
}

const emptySummary: ObservabilitySummary = {
  totalSignals: 0,
  totalErrors: 0,
  totalWindows: 0,
  stages: {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  },
};

const toPercent = (value: number) => `${value.toFixed(0)}%`;

const formatTrace = (trace: readonly string[]) =>
  trace.length > 0 ? trace.join(' → ') : 'idle';

export const HorizonObservabilityDashboard = ({
  tenantId,
  profile,
  summaries,
  trace,
  error,
}: HorizonObservabilityDashboardProps) => {
  const summary = summaries[summaries.length - 1] ?? emptySummary;
  const windowed = summaries.slice(-8);
  const qualityScore = Math.max(
    0,
    100 - Math.min(100, summary.totalErrors * 7 + Math.max(0, summary.totalWindows - summary.totalSignals)),
  );
  const stageEntries = Object.entries(summary.stages) as Array<[string, number]>;
  const hasError = typeof error === 'string' && error.length > 0;

  return (
    <section className="horizon-observability-dashboard">
      <header>
        <h3>Horizon Observability</h3>
        <p>Tenant {tenantId} in profile {profile}</p>
      </header>

      {hasError ? <p className="horizon-error">{error}</p> : null}

      <div className="stat-grid">
        <article>
          <strong>Total Signals</strong>
          <span>{summary.totalSignals}</span>
        </article>
        <article>
          <strong>Window Errors</strong>
          <span>{summary.totalErrors}</span>
        </article>
        <article>
          <strong>Trace Nodes</strong>
          <span>{summary.totalWindows}</span>
        </article>
        <article>
          <strong>Quality</strong>
          <span>{toPercent(qualityScore)}</span>
        </article>
      </div>

      <div className="stage-breakdown">
        <h4>Stage counts</h4>
        <ul>
          {stageEntries.map(([stage, count]) => (
            <li key={stage}>
              <span>{stage}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="history-strip">
        <h4>Recent trace</h4>
        <p>{formatTrace(trace)}</p>
      </div>

      <div className="history-bands">
        <h4>Signal trend</h4>
        <div className="band-row">
          {windowed.map((entry, index) => {
            const normalized = entry.totalSignals === 0 ? 0 : (entry.totalErrors / entry.totalSignals) * 100;
            return (
              <span
                key={`${entry.totalSignals}:${index}`}
                style={{ width: `${Math.min(100, Math.max(2, 100 - normalized))}%` }}
                title={`${entry.totalSignals} signals`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
