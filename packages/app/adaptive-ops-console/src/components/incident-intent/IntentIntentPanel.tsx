import { useMemo } from 'react';
import type { OrchestrationOutput } from '@domain/recovery-incident-intent';
import type { IncidentIntentOrchestratorState } from '../../hooks/useIncidentIntentOrchestrator';

export interface IntentIntentPanelProps {
  readonly output: OrchestrationOutput | null;
  readonly state: IncidentIntentOrchestratorState;
}

const statusLabel = (state: IncidentIntentOrchestratorState): string =>
  state.loading ? 'Loading...' : state.running ? 'Running' : `Runs: ${state.runCount}`;

export const IntentIntentPanel = ({ output, state }: IntentIntentPanelProps) => {
  const hasOutput = output !== null;
  const labels = useMemo(
    () =>
      output
        ? [
            `status:${output.status}`,
            `tenant:${output.tenantId}`,
            `route:${output.route.steps.length}`,
            `plan:${output.topPlan.phases.length}`,
          ]
        : ['status:idle'],
    [output],
  );

  return (
    <section>
      <header>
        <h2>Incident Intent Orchestrator</h2>
        <p>{statusLabel(state)}</p>
      </header>
      <ul>
        <li>Tenant: {state.tenant}</li>
        <li>Last output: {hasOutput ? output!.runId : 'none'}</li>
        <li>Errors: {state.errors.length}</li>
        <li>Signal count: {state.lastOutput?.route.steps.length ?? 0}</li>
      </ul>
      <div>
        {labels.map((label) => (
          <code key={label} style={{ display: 'inline-block', marginRight: 8 }}>
            {label}
          </code>
        ))}
      </div>
      <p>
        {hasOutput
          ? `${output!.topPlan.phases.length} phases, snapshot=${output!.snapshots.length}`
          : 'No orchestration output yet.'}
      </p>
    </section>
  );
};
