import { useMemo, useState } from 'react';
import { useLaneDashboard } from '../hooks/useLaneDashboard';
import { useLabWorkspace } from '../hooks/useLabWorkspace';
import { LabControlDeck } from '../components/LabControlDeck';
import { LabCommandLane } from '../components/LabCommandLane';
import { LabTimeline } from '../components/LabTimeline';
import { LabSignalBadge } from '../components/LabSignalBadge';
import { listCatalog, resolveWorkspace, loadCatalog } from '../services/labCatalogService';

interface RecoveryLabOrchestrationWorkspacePageProps {
  readonly tenant?: string;
}

export const RecoveryLabOrchestrationWorkspacePage = ({ tenant = 'tenant:global' }: RecoveryLabOrchestrationWorkspacePageProps) => {
  const catalog = useMemo(() => listCatalog(), []);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(
    resolveWorkspace(tenant),
  );
  const [selectedScenario, setSelectedScenario] = useState<string>(
    catalog[0]?.scenarioId ?? 'scenario:tenant:global:baseline',
  );

  const { state, isBusy, execute, refresh, toggleCommand, setMode } = useLabWorkspace({
    workspace: selectedWorkspace,
    scenario: selectedScenario,
    tenant,
  });

  const lanes = useLaneDashboard(state.lanes);
  const scoreSum = useMemo(
    () => state.lanes.reduce((acc, lane) => acc + lane.score, 0),
    [state.lanes],
  );

  const onWorkspace = (value: string) => {
    setSelectedWorkspace(value);
    void loadCatalog().then(() => refresh());
  };

  const onScenario = (value: string) => {
    setSelectedScenario(value);
    setMode('design');
    void refresh();
  };

  return (
    <main className="recovery-lab-orchestration-workspace-page">
      <header>
        <h1>Recovery Lab Orchestration Workspace</h1>
      </header>
      <section className="workspace-selector">
        <label>
          Workspace
          <select
            value={selectedWorkspace}
            onChange={(event) => onWorkspace(event.target.value)}
          >
            {catalog
              .filter((entry) => entry.tenant === tenant)
              .map((entry) => (
                <option key={entry.workspaceId} value={entry.workspaceId}>
                  {entry.workspaceId}
                </option>
              ))}
          </select>
        </label>
        <label>
          Scenario
          <select
            value={selectedScenario}
            onChange={(event) => onScenario(event.target.value)}
          >
            {catalog
              .filter((entry) => entry.tenant === tenant)
              .map((entry) => (
                <option key={entry.scenarioId} value={entry.scenarioId}>
                  {entry.scenarioId}
                </option>
              ))}
          </select>
        </label>
        <LabSignalBadge label="Avg lane score" value={scoreSum / Math.max(1, state.lanes.length)} />
      </section>
      <LabControlDeck
        overview={state.overview}
        commands={state.commands}
        signals={state.signals}
        isBusy={isBusy}
        onRefresh={refresh}
        onRun={execute}
        onToggle={toggleCommand}
      />
      <LabCommandLane lanes={state.lanes} />
      <LabTimeline signals={state.signals} />
      <section className="workspace-warnings">
        {state.signals.length > 0 ? <p>{`Recent signal: ${state.signals.at(-1)?.label}`}</p> : null}
      </section>
    </main>
  );
};
