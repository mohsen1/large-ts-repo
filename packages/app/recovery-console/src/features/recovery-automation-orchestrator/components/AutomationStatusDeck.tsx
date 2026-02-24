import { useMemo } from 'react';
import type { AutomationViewModel } from '../types';

interface AutomationStatusDeckProps {
  readonly viewModel: AutomationViewModel;
  readonly errorMessage?: string;
}

export const AutomationStatusDeck = ({ viewModel, errorMessage }: AutomationStatusDeckProps) => {
  const totalScore = useMemo(() => viewModel.summary?.riskScore ?? 0, [viewModel.summary]);
  const latestMetric = useMemo(() => viewModel.metrics.at(-1)?.value ?? 0, [viewModel.metrics]);
  const metricCount = viewModel.metrics.length;
  const statusClass = viewModel.status === 'failed' ? 'failed' : viewModel.status === 'in_progress' ? 'running' : 'ready';

  return (
    <section className={`automation-status-deck ${statusClass}`}>
      <header>
        <h1>Recovery Automation Orchestrator</h1>
      </header>
      <div className="automation-status-grid">
        <article>
          <h2>Tenant</h2>
          <p>{viewModel.tenant}</p>
        </article>
        <article>
          <h2>Plan</h2>
          <p>{viewModel.planId}</p>
        </article>
        <article>
          <h2>Status</h2>
          <p>{viewModel.status}</p>
        </article>
        <article>
          <h2>Commands</h2>
          <p>{viewModel.commands.length}</p>
        </article>
        <article>
          <h2>Risk Score</h2>
          <p>{totalScore.toFixed(1)}</p>
        </article>
        <article>
          <h2>Latest Metric</h2>
          <p>{latestMetric}</p>
        </article>
        <article>
          <h2>Window</h2>
          <p>{metricCount} points</p>
        </article>
      </div>
      {errorMessage ? <p className="automation-error">{errorMessage}</p> : null}
      {viewModel.summary ? (
        <section>
          <h3>Last Summary</h3>
          <p>{`Commands: ${viewModel.summary.commandCount}`}</p>
          <p>{`Failed stages: ${viewModel.summary.failedStageCount}`}</p>
          <p>{`Risk: ${viewModel.summary.riskScore}`}</p>
        </section>
      ) : null}
      <section className="automation-run-config">
        <h4>Run Configuration</h4>
        <ul>
          <li>Timeout: {viewModel.config.timeoutMs}ms</li>
          <li>Concurrency: {viewModel.config.concurrency}</li>
          <li>Telemetry: {String(viewModel.config.includeTelemetry ?? true)}</li>
          <li>Dry run: {String(viewModel.config.dryRun ?? false)}</li>
        </ul>
      </section>
    </section>
  );
};
