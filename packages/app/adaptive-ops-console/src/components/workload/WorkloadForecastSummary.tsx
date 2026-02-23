interface WorkloadForecastSummaryProps {
  readonly tenantId: string;
  readonly plans: number;
  readonly warnings: readonly string[];
  readonly coverage: number;
  readonly queue: readonly string[];
  readonly onRunAgain: () => void;
}

export const WorkloadForecastSummary = ({
  tenantId,
  plans,
  warnings,
  coverage,
  queue,
  onRunAgain,
}: WorkloadForecastSummaryProps) => {
  return (
    <section className="workload-forecast-summary">
      <header>
        <h3>Forecast overview · {tenantId}</h3>
        <button onClick={onRunAgain}>Re-run</button>
      </header>
      <dl>
        <div>
          <dt>Plans</dt>
          <dd>{plans}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>{(coverage * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Queue depth</dt>
          <dd>{queue.length}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{warnings.length === 0 ? 'healthy' : `${warnings.length} warning(s)`}</dd>
        </div>
      </dl>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>
            <strong>WARN</strong>
            <span>{warning}</span>
          </li>
        ))}
      </ul>
      <section>
        <h4>Queue preview</h4>
        <ol>
          {queue.slice(0, 8).map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      </section>
    </section>
  );
};
