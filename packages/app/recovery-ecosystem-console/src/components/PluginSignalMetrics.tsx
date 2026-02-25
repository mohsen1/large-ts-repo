import { useMemo, type ReactElement } from 'react';
import type { PluginRunResult } from '@domain/recovery-ecosystem-analytics';
import { summarizeRunDiagnostics } from '@domain/recovery-ecosystem-analytics';

interface PluginSignalMetricsProps {
  readonly results: readonly PluginRunResult[];
}

export const PluginSignalMetrics = ({ results }: PluginSignalMetricsProps): ReactElement => {
  const summary = useMemo(() => summarizeRunDiagnostics(results), [results]);
  return (
    <section>
      <h3>Signal Metrics</h3>
      <dl>
        <div>
          <dt>run</dt>
          <dd>{summary.runMetrics.runId}</dd>
        </div>
        <div>
          <dt>score</dt>
          <dd>{summary.runMetrics.score.toFixed(2)}</dd>
        </div>
        <div>
          <dt>signals</dt>
          <dd>{summary.runMetrics.signalCount}</dd>
        </div>
        <div>
          <dt>warnings</dt>
          <dd>{summary.runMetrics.warningCount}</dd>
        </div>
        <div>
          <dt>critical</dt>
          <dd>{summary.runMetrics.criticalCount}</dd>
        </div>
      </dl>
      <ul>
        {summary.state.traces.map((trace) => (
          <li key={trace}>{trace}</li>
        ))}
      </ul>
    </section>
  );
};
