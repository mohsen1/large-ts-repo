import { useMemo } from 'react';

import type { RecoveryCommandSurfaceWorkspace } from '../types';

interface RecoveryCommandSurfaceOverviewProps {
  readonly workspace: RecoveryCommandSurfaceWorkspace;
}

const toStatusColor = (state: RecoveryCommandSurfaceWorkspace['runs'][number]['state']): string => {
  if (state === 'completed') return '#0f766e';
  if (state === 'failed' || state === 'rolled_back') return '#dc2626';
  if (state === 'in_flight' || state === 'scheduled') return '#0369a1';
  return '#64748b';
};

const uniqueSignalCount = (workspace: RecoveryCommandSurfaceWorkspace): number =>
  workspace.runs.reduce((sum, run) => sum + run.signals.length, 0);

const formatState = (state: RecoveryCommandSurfaceWorkspace['runs'][number]['state']): string =>
  state.replace('_', ' ');

export const RecoveryCommandSurfaceOverview = ({ workspace }: RecoveryCommandSurfaceOverviewProps) => {
  const active = workspace.runs.filter((run) => run.state !== 'completed' && run.state !== 'failed');
  const failed = workspace.runs.filter((run) => run.state === 'failed').length;
  const completed = workspace.runs.filter((run) => run.state === 'completed').length;
  const stats = useMemo(
    () => ({
      totalRuns: workspace.runs.length,
      activeCount: active.length,
      completedCount: completed,
      failedCount: failed,
      signalCount: uniqueSignalCount(workspace),
      riskScore: workspace.runs.reduce((sum, run) => sum + run.riskScore, 0),
    }),
    [workspace.runs],
  );

  return (
    <section>
      <h2>Surface Workspace Overview</h2>
      <div>
        <p>Scope: {workspace.scopeLabel}</p>
        <p>Tenant: {workspace.tenant}</p>
        <p>Running: {workspace.running ? 'yes' : 'no'}</p>
      </div>
      <ul>
        <li>Total plans: {workspace.plans.length}</li>
        <li>Total runs: {stats.totalRuns}</li>
        <li>Active runs: {stats.activeCount}</li>
        <li>Completed: {stats.completedCount}</li>
        <li>Failed: {stats.failedCount}</li>
        <li>Total signals: {stats.signalCount}</li>
        <li>Aggregate risk score: {stats.riskScore}</li>
      </ul>
      <ol>
        {workspace.runs.map((run) => (
          <li key={run.id} style={{ color: toStatusColor(run.state) }}>
            {run.id} — {run.scenario} — {formatState(run.state)}
          </li>
        ))}
      </ol>
    </section>
  );
};
