import { type ReactElement, useMemo } from 'react';
import type { ConvergenceScope } from '@domain/recovery-lab-orchestration-core';
import { useRecoveryLabConvergenceRuntime } from '../hooks/useRecoveryLabConvergenceRuntime';

interface RuntimeConsoleProps {
  readonly tenantId: string;
  readonly onRunScope: (scope: ConvergenceScope) => void;
  readonly disabled?: boolean;
}

const scopeOrder: readonly ConvergenceScope[] = ['tenant', 'topology', 'signal', 'policy', 'fleet'];

export const RecoveryLabConvergenceRuntimeConsole = ({ tenantId, onRunScope, disabled = false }: RuntimeConsoleProps): ReactElement => {
  const { runSingle, runAll, state, setSignal, signal, canRun, isPending } = useRecoveryLabConvergenceRuntime(tenantId);

  const scopeButtons = useMemo(
    () =>
      scopeOrder.map((scope) => (
        <button
          type="button"
          key={scope}
          disabled={disabled || !canRun || isPending}
          onClick={() => {
            onRunScope(scope);
            void runSingle(scope);
          }}
        >
          Run {scope}
        </button>
      )),
    [disabled, canRun, onRunScope, runSingle, isPending],
  );

  return (
    <section className="recovery-lab-convergence-console">
      <h2>Convergence Runtime Console</h2>
      <div className="recovery-lab-console-controls">
        <label>
          signal seed
          <input
            value={signal}
            onChange={(event) => {
              setSignal(event.currentTarget.value);
            }}
          />
        </label>
        <div className="recovery-lab-console-actions">
          <button type="button" disabled={disabled || !canRun} onClick={() => void runAll()}>
            Run all scopes
          </button>
          {scopeButtons}
        </div>
      </div>
      <div className="recovery-lab-console-status">
        <span>status={state.status}</span>
        <span>runs={state.runs.length}</span>
        <span>manifests={state.manifests.length}</span>
      </div>
      <ul>
        {state.summaries.map((summary) => (
          <li key={`${summary.runId}:${summary.stage}`}>
            {summary.stage}: score={summary.score.toFixed(2)} confidence={summary.confidence.toFixed(2)} signals={summary.diagnostics}
          </li>
        ))}
      </ul>
    </section>
  );
};
