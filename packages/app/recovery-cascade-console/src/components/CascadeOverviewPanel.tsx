import { useId, useMemo } from 'react';
import type { CascadeSummary } from '../types.js';

type PanelState = CascadeSummary & {
  readonly pluginCount: number;
  readonly eventCount: number;
  readonly stageNames: readonly string[];
};

export interface CascadeOverviewPanelProps {
  readonly summary: PanelState;
}

export const CascadeOverviewPanel = ({ summary }: CascadeOverviewPanelProps) => {
  const headingId = useId();
  const stateClass = summary.state === 'failed'
    ? 'is-error'
    : summary.state === 'success'
      ? 'is-ok'
      : summary.state === 'running'
        ? 'is-running'
        : 'is-idle';

  const metricList = useMemo(
    () => summary.metrics.map((metric) => `${metric.metric}: ${metric.value} ${metric.unit}`),
    [summary.metrics],
  );

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Cascade Run Overview</h2>
      <p className={stateClass}>
        State: {summary.state} · Run: {summary.runId} · Tenant: {summary.tenantId}
      </p>
      <div>
        <p>Started: {summary.startedAt ?? 'not started'}</p>
        <p>Finished: {summary.finishedAt ?? 'running'}</p>
        <p>Plugins: {summary.pluginCount}</p>
        <p>Events captured: {summary.eventCount}</p>
        <p>Stages: {summary.stageNames.join(' → ') || 'none'}</p>
      </div>
      <ul>
        {metricList.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
};
