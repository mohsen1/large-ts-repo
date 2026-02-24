import { useMemo, useState } from 'react';
import { SignalMeshExecutionBoard } from '../components/mesh/SignalMeshExecutionBoard';
import { SignalMeshPolicyHeatmap } from '../components/mesh/SignalMeshPolicyHeatmap';
import { SignalMeshScenarioBoard } from '../components/mesh/SignalMeshScenarioBoard';
import { useMeshLabOrchestrator } from '../hooks/useMeshLabOrchestrator';

const SCENARIOS = [
  'control-lane',
  'policy-audit',
  'signal-scan',
  'sim-shape',
  'policy-override',
  'recovery-check',
] as const;

const scenarioSignals = (scenario: string): readonly string[] =>
  [scenario, `${scenario}-primary`, `${scenario}-secondary`];

const roundTrip = (value: number): number => Number(value.toFixed(6));

export function RecoveryCockpitMeshOrchestrationPage() {
  const tenantId = 'tenant-mesh-orchestrator';
  const {
    loading,
    history,
    errors,
    selectedScenario,
    reload,
    setSelectedScenario,
    runScenario,
  } = useMeshLabOrchestrator(tenantId);
  const [active, setActive] = useState<string | undefined>(undefined);
  const scores = useMemo(() => history.map((entry) => entry.score), [history]);
  const heatmapValues = scores.length > 0 ? scores.map((value) => roundTrip(value % 1)) : [0];
  const labels = history.map((entry) => entry.runId);
  const selectedRun = history.find((entry) => entry.runId === active);
  const selectedCount = selectedScenario === undefined ? 0 : 1;
  const canRerun = selectedRun !== undefined;

  const runFromBoard = async (runId: string) => {
    const selected = SCENARIOS.find((value) => runId.includes(value)) ?? SCENARIOS[0];
    await runScenario(selected, 'control', scenarioSignals(selected));
  };

  return (
    <main className="mesh-orchestrator-page">
      <h1>Recovery Cockpit Mesh Orchestration</h1>
      <p>{loading ? 'Executing scenarios...' : `Loaded ${history.length} historical runs`}</p>
      <section className="mesh-orchestrator-actions">
        <button type="button" onClick={() => reload()}>
          Reload compatibility checks
        </button>
        <button type="button" disabled={!canRerun} onClick={() => runFromBoard(selectedRun?.runId ?? SCENARIOS[0])}>
          Re-run selected
        </button>
      </section>
      {errors.length > 0 && (
        <div className="mesh-orchestrator-errors">
          {errors.map((entry) => (
            <p key={entry}>{entry}</p>
          ))}
        </div>
      )}
      <section className="mesh-orchestrator-panels">
        {history.map((scenario) => (
          <SignalMeshScenarioBoard
            key={scenario.runId}
            title={scenario.dependencies.namespace}
            scenario={scenario}
            selected={scenario.runId === active}
            onSelect={(runId) => {
              setActive(runId);
              setSelectedScenario(runId);
            }}
            onRerun={(runId) => runFromBoard(runId)}
          />
        ))}
      </section>
      <section className="mesh-orchestrator-traces">
        {selectedRun === undefined ? (
          <p>Select a scenario to inspect traces and heatmap.</p>
        ) : (
          <>
            <SignalMeshExecutionBoard run={selectedRun} maxRows={20} onClear={() => setActive(undefined)} />
            <SignalMeshPolicyHeatmap
              values={heatmapValues}
              labels={[...labels, 'fallback']}
              columns={Math.max(2, Math.min(6, history.length || 1))}
              onSelectCell={(index, value) => {
                const item = history[index];
                if (item !== undefined) {
                  setActive(item.runId);
                }
              }}
            />
          </>
        )}
      </section>
      <section className="mesh-orchestrator-summary">
        <p>Total selected runs: {selectedCount}</p>
        <p>Average score: {scores.length > 0 ? roundTrip(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4) : '0'}</p>
      </section>
    </main>
  );
}
