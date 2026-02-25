import { useCallback } from 'react';
import { useScenarioStudioWorkspace } from '../../hooks/scenario-studio/useScenarioStudioWorkspace';
import { ScenarioPlanInspector } from '../../components/scenario-studio/ScenarioPlanInspector';
import { ScenarioRunCard } from '../../components/scenario-studio/ScenarioRunCard';
import { ScenarioStudioCanvas } from '../../components/scenario-studio/ScenarioStudioCanvas';

export function ScenarioStudioPage() {
  const {
    state,
    reload,
    selectTemplate,
    startRun,
    switchMode,
    sortedRuns,
    latestRun,
  } = useScenarioStudioWorkspace();

  const selected = state.model.templates.find((template) => template.id === state.model.selectedTemplateId) ?? null;
  const runForView = sortedRuns.find((run) => run.runId === state.model.selectedRunId) ?? sortedRuns[0] ?? null;

  const handleStart = useCallback(() => {
    void startRun(state.model.currentMode);
  }, [state.model.currentMode, startRun]);

  return (
    <main className="scenario-studio-page">
      <header>
        <h2>Recovery Scenario Studio</h2>
        <p>
          Modern orchestration surface with scenario topology planning, simulation, and execution telemetry.
        </p>
      </header>
      <section>
        <button type="button" onClick={() => void reload()}>
          Refresh
        </button>
        <button type="button" onClick={() => switchMode('analysis')}>
          Analysis
        </button>
        <button type="button" onClick={() => switchMode('simulation')}>
          Simulation
        </button>
        <button type="button" onClick={() => switchMode('execution')}>
          Execution
        </button>
        <button type="button" onClick={() => switchMode('chaos')}>
          Chaos
        </button>
      </section>
      <nav>
        {state.model.templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => selectTemplate(template.id)}
            aria-current={state.model.selectedTemplateId === template.id}
          >
            {template.name}
          </button>
        ))}
      </nav>
      <ScenarioStudioCanvas
        template={selected}
        runs={sortedRuns}
        onStart={(input) => void startRun(input.mode)}
      />
      <section>
        <button type="button" onClick={handleStart}>
          Start new run ({state.model.currentMode})
        </button>
      </section>
      <section>
        <h3>Run History</h3>
        <div className="run-grid">
          {sortedRuns.map((run) => (
            <ScenarioRunCard key={run.runId} run={run} onSelect={() => {}} />
          ))}
        </div>
      </section>
      <ScenarioPlanInspector template={selected} run={runForView} />
      <footer>
        <p>Latest run status: {latestRun ? latestRun.state : 'idle'}</p>
        <pre>{JSON.stringify(state.history.slice(0, 8), null, 2)}</pre>
      </footer>
    </main>
  );
}

export default ScenarioStudioPage;
