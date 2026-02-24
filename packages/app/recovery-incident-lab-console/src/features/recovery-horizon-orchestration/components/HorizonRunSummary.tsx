import { type ReactElement, useMemo, useState } from 'react';
import type { OrchestrationSummary } from '../types';
import type { MeshExecution } from '@service/recovery-horizon-orchestrator/horizon-mesh.js';

interface HorizonRunSummaryProps {
  readonly summary: OrchestrationSummary;
  readonly history: readonly MeshExecution[];
}

const describeTrend = (entry: OrchestrationSummary['trend'][number]): string =>
  `${entry.stage}:${entry.count} (${Math.round(entry.ratio * 100)}%)`; 

const describeExecution = (entry: MeshExecution): string => {
  const elapsed = Number(entry.finishedAt) - Number(entry.startedAt);
  const count = entry.steps.reduce((total, step) => total + step.emitted, 0);
  return `${entry.mode} ${entry.runId} bindings=${entry.steps.length} emitted=${count} elapsed=${elapsed}ms`;
};

export const HorizonRunSummary = ({ summary, history }: HorizonRunSummaryProps): ReactElement => {
  const [expanded, setExpanded] = useState(false);
  const total = useMemo(() => history.reduce((acc, item) => acc + item.steps.length, 0), [history]);

  const topTrend = summary.trend
    .slice()
    .sort((left, right) => right.ratio - left.ratio)
    .slice(0, 3);

  const tail = history.slice(-3).map(describeExecution);

  return (
    <section className="horizon-run-summary">
      <h2>Run Summary</h2>
      <dl>
        <dt>Plan</dt>
        <dd>{summary.planId ?? 'none'}</dd>
        <dt>Run</dt>
        <dd>{summary.runId ?? 'none'}</dd>
        <dt>Mode</dt>
        <dd>{summary.mode}</dd>
        <dt>Signals</dt>
        <dd>{summary.signalCount}</dd>
        <dt>Records</dt>
        <dd>{summary.recordsCount}</dd>
        <dt>Steps</dt>
        <dd>{total}</dd>
      </dl>
      <div>
        <h3>Top trends</h3>
        <ul>
          {topTrend.map((entry) => (
            <li key={entry.stage}>{describeTrend(entry)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Recent history</h3>
        <ul>
          {tail.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
      <details onToggle={(event) => setExpanded((event.target as HTMLDetailsElement).open)}>
        <summary>Raw execution ledger</summary>
        <pre>{JSON.stringify(history, null, 2)}</pre>
        <p>Expanded: {expanded ? 'yes' : 'no'}</p>
      </details>
    </section>
  );
};
