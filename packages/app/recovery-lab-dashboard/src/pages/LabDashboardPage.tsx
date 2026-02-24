import { useMemo, useState } from 'react';
import { useLabWorkspace } from '../hooks/useLabWorkspace';
import { LabControlDeck } from '../components/LabControlDeck';
import { PluginRegistryGrid } from '../components/PluginRegistryGrid';
import { ScenarioTimeline } from '../components/ScenarioTimeline';
import { summarizeScenario, type ScenarioSummary } from '../services/labAdapter';

interface LabDashboardPageProps {
  readonly tenant: string;
}

export const LabDashboardPage = ({ tenant }: LabDashboardPageProps) => {
  const workspace = useLabWorkspace(tenant);
  const [scenario, setScenario] = useState('');

  const summaries = useMemo(
    () => workspace.scenarios.map((item) => summarizeScenario(item)),
    [workspace.scenarios],
  );

  const selectedScenario = useMemo(
    () => workspace.scenarios.find((item) => item.scenarioId === scenario) ?? workspace.scenarios[0] ?? null,
    [scenario, workspace.scenarios],
  );

  if (workspace.loading) {
    return <p>loading workspace...</p>;
  }

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Recovery Lab Dashboard</h1>
      <section>
        <label htmlFor="tenant-scenario">Scenario</label>
        <select
          id="tenant-scenario"
          value={selectedScenario?.scenarioId ?? ''}
          onChange={(event) => setScenario(event.currentTarget.value)}
        >
          {workspace.scenarios.map((item) => (
            <option key={item.scenarioId} value={item.scenarioId}>
              {item.scenarioId} · {item.kind}
            </option>
          ))}
        </select>
        <button type="button" onClick={workspace.refresh}>refresh</button>
      </section>

      <LabControlDeck
        tenant={tenant}
        scenarioId={selectedScenario?.scenarioId ?? ''}
        summaries={summaries}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ScenarioTimeline
          executions={workspace.executions}
          onSelect={(executionId) => {
            void executionId;
          }}
          selectedExecutionId={workspace.selectedExecutionId}
        />
        <PluginRegistryGrid tenant={tenant} />
      </div>

      <section>
        <h2>Risk signal summary</h2>
        <ul>
          {summaries
            .toSorted((left, right) => right.risk - left.risk)
            .map((entry: ScenarioSummary) => (
              <li key={entry.scenarioId}>
                {entry.scenarioId} risk={entry.risk.toFixed(2)} lane={entry.lane}
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h2>Execution log</h2>
        <ul>
          {workspace.logs.map((log) => (
            <li key={log}>{log}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
