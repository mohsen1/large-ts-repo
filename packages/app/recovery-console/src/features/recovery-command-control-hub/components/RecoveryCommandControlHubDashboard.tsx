import { memo } from 'react';
import { type HubDraft, type HubExecution } from '@domain/recovery-command-control-hub';

interface RecoveryCommandControlHubDashboardProps {
  readonly tenant: string;
  readonly runId: string;
  readonly execution?: HubExecution;
  readonly draft: HubDraft;
}

const riskPercent = (nodes: number, failed: number): number => (nodes === 0 ? 0 : Number(((failed / nodes) * 100).toFixed(2)));

export const RecoveryCommandControlHubDashboard = memo(
  ({ tenant, runId, execution, draft }: RecoveryCommandControlHubDashboardProps) => {
    const failed = execution
      ? execution.checkpoints.filter((checkpoint) => checkpoint.state === 'failed').length
      : 0;

    const percent = riskPercent(draft.summary.totalNodes, draft.summary.blockedNodeCount);

    return (
      <section>
        <h3>Execution Dashboard</h3>
        <p>{`tenant=${tenant}`}</p>
        <p>{`run=${runId}`}</p>
        <p>{`state=${execution?.run.state ?? 'unknown'}`}</p>
        <p>{`nodes=${draft.summary.totalNodes}`}</p>
        <p>{`failed checkpoints=${failed}`}</p>
        <p>{`risk ${percent}%`}</p>
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(draft.summary.byState).map(([state, count]) => (
              <tr key={state}>
                <td>{state}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  },
);
