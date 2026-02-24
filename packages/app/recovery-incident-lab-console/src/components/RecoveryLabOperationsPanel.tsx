import { type ReactElement, useMemo, type MouseEvent } from 'react';
import { type OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';

interface Action {
  readonly label: string;
  readonly href?: string;
}

interface Props {
  readonly output?: OrchestratorOutput;
  readonly summary?: string;
  readonly statusText: string;
  readonly onRefresh: () => void;
  readonly onReset: () => void;
  readonly isRunning: boolean;
  readonly logs: readonly string[];
  readonly actions: readonly Action[];
}

const hasAction = (actions: readonly Action[]): actions is readonly (Action & { href: string })[] =>
  actions.every((action) => typeof action.href === 'string');

export const RecoveryLabOperationsPanel = ({
  output,
  summary,
  statusText,
  onRefresh,
  onReset,
  isRunning,
  logs,
  actions,
}: Props): ReactElement => {
  const onResetClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    onReset();
  };

  const onRefreshClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    onRefresh();
  };

  const outputSummary = useMemo(() => (output ? `plan ${output.plan.id} run ${output.run.runId}` : 'no output'), [output]);
  const actionLabels = useMemo(() => actions.map((action) => action.label), [actions]);

  return (
    <section className="recovery-lab-operations-panel">
      <h2>Operations control</h2>
      <p>{statusText}</p>
      <p>{outputSummary}</p>
      <p>{summary ?? 'No summary'}</p>
      <div>
        <button type="button" disabled={isRunning} onClick={onRefreshClick}>
          Recompute surface
        </button>
        <button type="button" onClick={onResetClick}>
          Reset workspace
        </button>
      </div>
      <details>
        <summary>Recent logs</summary>
        <ul>
          {logs.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </details>
      <p>Actions: {actionLabels.join(', ') || 'none'}</p>
      {hasAction(actions) && (
        <ul>
          {actions.map((action) => (
            <li key={action.label}>
              <a href={action.href}>{action.label}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
