import { useCallback, useMemo } from 'react';
import { useCommandLab } from '../hooks/useCommandLab';
import { CommandLabControls } from '../components/incident-lab/CommandLabControls';
import { CommandLabReadinessPanel } from '../components/incident-lab/CommandLabReadinessPanel';
import { CommandLabTimeline } from '../components/incident-lab/CommandLabTimeline';

export const IncidentCommandLabPage = () => {
  const {
    state,
    setTenant,
    setHints,
    setMaxParallelism,
    setRollbackWindow,
    setReadinessCutoff,
    setRiskCutoff,
    runTemplate,
    runExecute,
    refreshSummary,
    clearState,
  } = useCommandLab();

  const hasRuns = useMemo(() => state.runs.length > 0, [state.runs.length]);
  const runButtonLabel = useMemo(() => (state.loading ? 'running...' : 'execute draft'), [state.loading]);

  const onHintsInput = useCallback(
    (value: readonly string[]) => {
      setHints(value.length === 0 ? ['readiness'] : value);
    },
    [setHints],
  );

  return (
    <main className="incident-command-lab-page">
      <header>
        <h1>Incident Command Lab</h1>
        <p>Iterative draft and runbook command planning surface.</p>
        <button onClick={clearState}>Clear</button>
      </header>

      <CommandLabControls
        state={state}
        filter={state.filter}
        onTenant={setTenant}
        onHints={onHintsInput}
        onParallelism={setMaxParallelism}
        onRollbackWindow={setRollbackWindow}
        onReadiness={setReadinessCutoff}
        onRisk={setRiskCutoff}
        onRunDraft={runTemplate}
        onExecute={runExecute}
        onRefresh={refreshSummary}
      />

      <section>
        <h2>Latest outcome</h2>
        <p>{state.loading ? 'Computing draft and simulation...' : 'Idle'}</p>
        <p>Run label: {runButtonLabel}</p>
        <p>Has historical runs: {String(hasRuns)}</p>
      </section>

      <CommandLabReadinessPanel state={state} />
      <CommandLabTimeline state={state} />

      <section>
        <h2>Catalog trace</h2>
        {state.drafts.length === 0 ? (
          <p>No draft artifacts available.</p>
        ) : (
          <ul>
            {state.drafts.flatMap((draft) => [
              `draft:${draft.runId}`,
              `plan:${draft.planId}`,
              `candidates:${draft.candidates.length}`,
            ]).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        )}
      </section>
    </main>
  );
};
