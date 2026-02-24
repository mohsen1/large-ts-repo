import { type ReactElement, useMemo } from 'react';
import type { IncidentLabRun, IncidentLabSignal, IncidentLabPlan, IncidentLabScenario } from '@domain/recovery-incident-lab-core';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';

export type RecoveryIncidentLabStatus = {
  readonly state: string;
  readonly notes: readonly string[];
};

export type RecoveryIncidentLabOutput = {
  readonly runId: string;
  readonly state: IncidentLabRun['state'];
  readonly signals: readonly IncidentLabSignal[];
  readonly planId: IncidentLabPlan['id'];
  readonly scenarioName: IncidentLabScenario['name'];
};

export const RecoveryIncidentLabSummaryPage = (): ReactElement => {
  const { state, plan, summary } = useRecoveryIncidentLabWorkspace();

  const output = useMemo(() => {
    if (!state.output) {
      return undefined;
    }
    return {
      runId: state.output.run.runId,
      state: state.output.run.state,
      planId: state.output.plan.id,
      scenarioName: state.scenario?.name ?? 'unknown',
      signals: state.output.telemetry.map((event) => event.payload).filter((payload): payload is IncidentLabSignal =>
        !!payload &&
        typeof payload === 'object' &&
        'kind' in payload &&
        'value' in payload,
      ),
    };
  }, [state]);

  const status: RecoveryIncidentLabStatus = useMemo(() => ({
    state: state.mode,
    notes: [...state.notes],
  }), [state.mode, state.notes]);

  return (
    <article className="recovery-incident-lab-summary-page">
      <header>
        <h1>Recovery Incident Lab Summary</h1>
      </header>
      <section>
        <h2>Current scenario</h2>
        <p>{state.scenario?.name}</p>
      </section>
      <section>
        <h2>Last run</h2>
        <p>{summary}</p>
      </section>
      {plan && (
        <section>
          <h2>Plan snapshot</h2>
          <ul>
            <li>id: {plan.id}</li>
            <li>selected: {plan.selected.length}</li>
            <li>state: {plan.state}</li>
          </ul>
        </section>
      )}
      {output && (
        <section>
          <h2>Output</h2>
          <dl>
            <dt>run</dt>
            <dd>{output.runId}</dd>
            <dt>state</dt>
            <dd>{output.state}</dd>
            <dt>plan</dt>
            <dd>{output.planId}</dd>
            <dt>scenario</dt>
            <dd>{output.scenarioName}</dd>
          </dl>
          <p>telemetry signals: {output.signals.length}</p>
        </section>
      )}
      <section>
        <h2>Mode</h2>
        <p>{status.state}</p>
        <pre>{status.notes.join('\n')}</pre>
      </section>
    </article>
  );
};
