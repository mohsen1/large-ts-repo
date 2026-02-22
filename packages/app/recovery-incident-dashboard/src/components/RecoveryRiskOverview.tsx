import { useMemo } from 'react';
import type { DashboardRunState } from '../types';

export interface RecoveryRiskOverviewProps {
  readonly runs: readonly DashboardRunState[];
  readonly title: string;
}

interface RiskBucket {
  readonly id: DashboardRunState['state'];
  readonly count: number;
}

const classifySeverity = (run: DashboardRunState): number => {
  if (run.state === 'failed') {
    return 3;
  }
  if (run.state === 'running') {
    return 2;
  }
  if (run.state === 'pending') {
    return 1;
  }
  return 0;
};

export const RecoveryRiskOverview = ({ runs, title }: RecoveryRiskOverviewProps) => {
  const bucketed = useMemo<Record<DashboardRunState['state'], RiskBucket>>(() => ({
    pending: { id: 'pending', count: 0 },
    running: { id: 'running', count: 0 },
    done: { id: 'done', count: 0 },
    failed: { id: 'failed', count: 0 },
  }), []);

  for (const run of runs) {
    const current = bucketed[run.state];
    bucketed[run.state] = {
      id: run.state,
      count: current.count + 1,
    };
  }

  const score = useMemo(() => {
    const weighted = runs.reduce((total, run) => total + classifySeverity(run), 0);
    return Number((weighted / Math.max(1, runs.length)).toFixed(2));
  }, [runs]);

  const recommendation = score > 2
    ? 'High risk: prioritize failed and running recovery nodes.'
    : score > 1
      ? 'Medium risk: observe running nodes and maintain manual checks.'
      : 'Low risk: stable queue, standard monitoring mode.';

  return (
    <article className="recovery-risk-overview">
      <h2>{title}</h2>
      <p>Risk score: {score}</p>
      <p>{recommendation}</p>
      <ul>
        <li key="pending">pending: {bucketed.pending.count}</li>
        <li key="running">running: {bucketed.running.count}</li>
        <li key="done">done: {bucketed.done.count}</li>
        <li key="failed">failed: {bucketed.failed.count}</li>
      </ul>
    </article>
  );
};
