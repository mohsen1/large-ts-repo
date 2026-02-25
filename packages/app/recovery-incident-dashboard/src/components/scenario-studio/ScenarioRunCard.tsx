import type { ScenarioRunSnapshot } from '../../types/scenario-studio';

interface ScenarioRunCardProps {
  readonly run: ScenarioRunSnapshot;
  readonly onSelect?: (runId: string) => void;
}

const stateLabel = new Map<ScenarioRunSnapshot['state'], string>([
  ['building', 'Build'],
  ['deploying', 'Deploy'],
  ['running', 'Run'],
  ['monitoring', 'Monitor'],
  ['finished', 'Complete'],
]);

export function ScenarioRunCard({ run, onSelect }: ScenarioRunCardProps) {
  const label = stateLabel.get(run.state) ?? run.state;
  const latency = run.stageStats.reduce((sum, item) => sum + item.latencyMs, 0);
  const allGood = run.stageStats.every((entry) => entry.status !== 'failed');

  return (
    <article className={`run-card ${allGood ? 'healthy' : 'degraded'}`}>
      <header>
        <h4>{run.mode} run</h4>
        <span>{label}</span>
      </header>
      <dl>
        <div>
          <dt>Run ID</dt>
          <dd>{run.runId}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{run.progress}%</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{run.stagesComplete}</dd>
        </div>
        <div>
          <dt>Total latency</dt>
          <dd>{latency} ms</dd>
        </div>
      </dl>
      <progress max={100} value={run.progress} />
      <ul>
        {run.stageStats.map((entry) => (
          <li key={entry.stageId}>
            {entry.stageId}: {entry.latencyMs}ms · {entry.status}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onSelect?.(run.runId)}>
        Inspect
      </button>
    </article>
  );
}

export default ScenarioRunCard;
