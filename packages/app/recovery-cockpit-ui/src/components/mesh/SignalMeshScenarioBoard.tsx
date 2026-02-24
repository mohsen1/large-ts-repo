import { memo } from 'react';
import type { MeshScenarioResult } from '../../services/recoveryCockpitOrchestrationService';

export interface SignalMeshScenarioBoardProps {
  readonly title: string;
  readonly scenario: MeshScenarioResult;
  readonly selected: boolean;
  readonly onSelect: (runId: string) => void;
  readonly onRerun: (runId: string) => void;
}

type ScenarioRow = {
  readonly label: string;
  readonly value: string;
};

const buildRows = (scenario: MeshScenarioResult): readonly ScenarioRow[] => [
  { label: 'Run', value: scenario.runId },
  { label: 'Score', value: scenario.score.toFixed(4) },
  { label: 'Confidence', value: scenario.confidence.toFixed(4) },
  { label: 'Traces', value: `${scenario.traces.length}` },
  { label: 'Checksum', value: scenario.runtime.checksum },
];

export const SignalMeshScenarioBoard = memo<SignalMeshScenarioBoardProps>(({
  title,
  scenario,
  selected,
  onSelect,
  onRerun,
}) => {
  const rows = buildRows(scenario);
  return (
    <article className={`mesh-scenario-card ${selected ? 'mesh-scenario-card--selected' : ''}`}>
      <header>
        <h3>{title}</h3>
        <p>{scenario.ok ? 'OK' : 'Failed'}</p>
      </header>
      <ul>
        {rows.map((entry) => (
          <li key={`${scenario.runId}:${entry.label}`}>
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </li>
        ))}
      </ul>
      <footer>
        <button type="button" onClick={() => onSelect(scenario.runId)}>
          Select
        </button>
        <button type="button" onClick={() => onRerun(scenario.runId)}>
          Re-run
        </button>
      </footer>
    </article>
  );
});
