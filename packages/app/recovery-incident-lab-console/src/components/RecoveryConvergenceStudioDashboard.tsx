import { useMemo } from 'react';
import {
  useConvergenceStudioOrchestrator,
} from '../hooks/useConvergenceStudioOrchestrator';
import type { StudioWorkspace } from '../services/convergenceStudioService';
import { RecoveryConvergenceStudioTimelinePanel } from './RecoveryConvergenceStudioTimelinePanel';
import { RecoveryConvergenceStudioRunbookPanel } from './RecoveryConvergenceStudioRunbookPanel';

type DashboardMetric = {
  readonly key: string;
  readonly value: number;
  readonly tone: 'good' | 'warn' | 'critical';
};

const deriveMetrics = (workspace: StudioWorkspace | null): readonly DashboardMetric[] => {
  if (!workspace) {
    return [
      { key: 'runs', value: 0, tone: 'warn' },
      { key: 'constraints', value: 0, tone: 'warn' },
      { key: 'runbooks', value: 0, tone: 'warn' },
    ];
  }

  const constraints = workspace.runs.reduce((acc, entry) => acc + entry.constraintCount, 0);
  const runbooks = workspace.runs.reduce((acc, entry) => acc + entry.selectedRunbookCount, 0);

  return [
    { key: 'runs', value: workspace.runs.length, tone: workspace.runs.length > 0 ? 'good' : 'warn' },
    { key: 'constraints', value: constraints, tone: constraints > 10 ? 'good' : constraints > 0 ? 'warn' : 'critical' },
    { key: 'runbooks', value: runbooks, tone: runbooks > 2 ? 'good' : runbooks > 0 ? 'warn' : 'critical' },
  ];
};

export interface RecoveryConvergenceStudioDashboardProps {
  readonly tenantId: string;
}

export const RecoveryConvergenceStudioDashboard = ({ tenantId }: RecoveryConvergenceStudioDashboardProps) => {
  const {
    state,
    isBusy,
    isReady,
    latestRunIds,
    updateScope,
    reset,
  } = useConvergenceStudioOrchestrator(tenantId);

  const metrics = useMemo(() => deriveMetrics(state.workspace), [state.workspace]);

  return (
    <section className="convergence-dashboard">
      <header className="convergence-dashboard__header">
        <h2>Convergence Studio</h2>
        <p>{tenantId}</p>
        <button type="button" onClick={() => updateScope([...state.scopes].reverse())}>
          Reverse Scope Order
        </button>
        <button type="button" onClick={() => reset()}>
          Reset Workspace
        </button>
      </header>
      <div className="convergence-dashboard__status">
        <p>{isBusy ? 'Running convergence sessions' : isReady ? 'Ready' : 'Idle'}</p>
        <p>{state.error ?? 'No errors'}</p>
      </div>
      <section className="convergence-dashboard__metrics">
        {metrics.map((metric) => (
          <article key={metric.key} className={`metric metric--${metric.tone}`}>
            <span className="metric__label">{metric.key}</span>
            <span className="metric__value">{metric.value}</span>
          </article>
        ))}
      </section>
      <RecoveryConvergenceStudioRunbookPanel runs={state.workspace?.runs ?? []} />
      <RecoveryConvergenceStudioTimelinePanel
        timeline={state.timeline}
        runIds={latestRunIds}
      />
      <pre>{JSON.stringify(state.workspace?.runs ?? [], null, 2)}</pre>
    </section>
  );
};
