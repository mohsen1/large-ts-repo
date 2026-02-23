import { useMemo } from 'react';
import type { PlaybookLabPageState } from '../types';
import { PlaybookLabSelectionRow } from './PlaybookLabSelectionRow';
import { PlaybookPortfolioTable } from './PlaybookPortfolioTable';
import type { PlaybookSelectionPolicy } from '@domain/recovery-playbooks';

export interface PlaybookLabDashboardProps {
  readonly state: PlaybookLabPageState;
  readonly policy: PlaybookSelectionPolicy;
  readonly health: string;
  readonly onSeed: () => void;
  readonly onRefresh: () => void;
  readonly onQueue: () => void;
}

export const PlaybookLabDashboard = ({
  state,
  policy,
  health,
  onSeed,
  onRefresh,
  onQueue,
}: PlaybookLabDashboardProps) => {
  const totalRows = state.rows.length;
  const selectedSteps = state.rows.reduce((acc, row) => acc + row.reasons.length, 0);
  const summary = useMemo(
    () => ({
      playbooks: totalRows,
      alerts: state.alerts.length,
      seedCount: state.config.horizonHours,
      selectedSteps,
      policyStatus: state.catalog.policies.maxStepsPerRun,
      health,
    }),
    [state.rows.length, state.alerts.length, selectedSteps, state.config.horizonHours, state.catalog.policies.maxStepsPerRun, health],
  );

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <header>
        <h2>Playbook Lab Dashboard</h2>
        <p>{state.pageTitle}</p>
      </header>

      <aside style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.75rem' }}>
        <article>
          <strong>Playbooks</strong>
          <div>{summary.playbooks}</div>
        </article>
        <article>
          <strong>Alerts</strong>
          <div>{summary.alerts}</div>
        </article>
        <article>
          <strong>Seed Horizon</strong>
          <div>{summary.seedCount}h</div>
        </article>
        <article>
          <strong>Steps</strong>
          <div>{summary.selectedSteps}</div>
        </article>
        <article>
          <strong>Policy</strong>
          <div>{summary.policyStatus}</div>
        </article>
        <article>
          <strong>Health</strong>
          <div>{summary.health}</div>
        </article>
      </aside>

      <section style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onRefresh}>
          Refresh catalog
        </button>
        <button type="button" onClick={onQueue}>
          Queue run
        </button>
        <button type="button" onClick={onSeed}>
          Seed samples
        </button>
      </section>

      <section>
        <h3>Policy snapshot</h3>
        <ul>
          <li>allowed statuses: {policy.allowedStatuses.join(', ')}</li>
          <li>required labels: {policy.requiredLabels.join(', ') || 'none'}</li>
          <li>forbidden channels: {policy.forbiddenChannels.join(', ') || 'none'}</li>
          <li>max steps per run: {policy.maxStepsPerRun}</li>
        </ul>
      </section>

      <PlaybookPortfolioTable rows={state.rows} />
      <PlaybookLabSelectionRow rows={state.rows} />
      <pre style={{ fontSize: '0.8rem', background: '#0f172a', color: '#dbeafe', padding: '0.75rem', borderRadius: 8 }}>
        {JSON.stringify(state.history.slice(-5), null, 2)}
      </pre>
    </section>
  );
};
