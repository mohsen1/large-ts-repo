import { type ReactElement } from 'react';
import type { SyntheticRunRecord } from '@data/recovery-synthetic-orchestration-store';
import type { SyntheticWorkspaceActions } from '../hooks/useRecoverySyntheticOrchestrationWorkspace';

interface DashboardProps {
  readonly runs: readonly SyntheticRunRecord[];
  readonly loading: boolean;
  readonly seedRunId: string;
  readonly selected: string | undefined;
  readonly actions: SyntheticWorkspaceActions;
}

const statusTone = (status: SyntheticRunRecord['status']): 'good' | 'warn' | 'bad' | 'idle' => {
  switch (status) {
    case 'succeeded':
      return 'good';
    case 'failed':
      return 'bad';
    case 'degraded':
      return 'warn';
    default:
      return 'idle';
  }
};

const formatDelta = (left: string, right: string): string => {
  const deltaMs = Math.max(0, new Date(left).getTime() - new Date(right).getTime());
  return `${deltaMs}ms`;
};

export const SyntheticOrchestrationDashboard = ({
  runs,
  loading,
  seedRunId,
  selected,
  actions,
}: DashboardProps): ReactElement => {
  const latest = runs[0];
  const averageWarnings = runs.length
    ? runs.reduce((sum, run) => sum + run.warnings.length, 0) / Math.max(1, runs.length)
    : 0;

  return (
    <section className="synthetic-orchestration-dashboard">
      <header>
        <h2>Synthetic Orchestration Studio</h2>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => void actions.runOnce('tenant-synthetic', 'workspace-console')}>
          Run Simulation
        </button>
      </header>
      <div>
        <p>{`Seed run: ${seedRunId}`}</p>
        <p>{`Loading: ${loading ? 'yes' : 'no'}`}</p>
        <p>{`Latest run count: ${runs.length}`}</p>
        <p>{`Average warnings: ${averageWarnings.toFixed(2)}`}</p>
      </div>
      <section>
        <h3>Latest run</h3>
        {latest ? (
          <div>
            <p>{`runId=${latest.runId}`}</p>
            <p>{`status=${latest.status} tone=${statusTone(latest.status)}`}</p>
            <p>{`warnings=${latest.warnings.length}`}</p>
            <p>{`workspace=${latest.workspaceId}`}</p>
            <p>{`last update delta=${formatDelta(new Date().toISOString(), latest.updatedAt)}`}</p>
            <button
              type="button"
              onClick={() => {
                actions.select(latest.runId);
              }}
            >
              Select latest
            </button>
          </div>
        ) : (
          <p>No latest run yet</p>
        )}
      </section>
      <section>
        <h3>Active runs</h3>
        <ul>
          {runs.map((run) => (
            <li key={run.runId}>
              <button
                type="button"
                onClick={() => {
                  actions.select(run.runId);
                }}
              >
                {run.runId}
              </button>
              <span>{` | ${run.status} | warnings:${run.warnings.length}`}</span>
              <span>{run.runId === selected ? ' [selected]' : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
