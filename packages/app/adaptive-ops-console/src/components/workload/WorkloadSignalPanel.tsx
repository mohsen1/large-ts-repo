import type { AdaptiveOpsDashboardState } from '../../hooks/useAdaptiveOpsDashboard';
import type { WorkloadOrchestrationState } from '../../hooks/useWorkloadOrchestration';

interface WorkloadSignalPanelProps {
  readonly dashboard: AdaptiveOpsDashboardState;
  readonly workload: WorkloadOrchestrationState;
}

export const WorkloadSignalPanel = ({ dashboard, workload }: WorkloadSignalPanelProps) => {
  const lastSummary = dashboard.summaries.at(-1);
  return (
    <section className="workload-signal">
      <h3>Signal correlation</h3>
      <div>
        <p>Dashboard runs: {dashboard.summaries.length}</p>
        <p>Active errors: {dashboard.errors.length}</p>
        <p>Workload plans: {workload.plans}</p>
        <p>Signal samples: {workload.signals.length}</p>
      </div>
      <p>Latest run: {lastSummary ? `${lastSummary.runId ?? 'pending'} (${lastSummary.status})` : 'none'}</p>
      <ul>
        {workload.signals.length > 0 ? (
          workload.signals.map((signal) => <li key={signal}>{signal}</li>)
        ) : (
          <li>No signals generated yet</li>
        )}
      </ul>
    </section>
  );
};
