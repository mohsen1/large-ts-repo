import type { RecoveryRun } from '@domain/recovery-scenario-orchestration';

export interface ScenarioTimelineProps {
  readonly runs: readonly RecoveryRun[];
  readonly selectedRunId: string | null;
  readonly onSelectRun: (id: string) => void;
}

const isActionableState = (state: RecoveryRun['state']): state is
  | 'running'
  | 'idle'
  | 'suspended'
  | 'resolved'
  | 'failed'
  | 'rolledBack' =>
  state !== 'planned';

const barClass = (state: RecoveryRun['state']): 'green' | 'amber' | 'red' => {
  if (state === 'resolved') {
    return 'green';
  }
  if (state === 'running' || state === 'idle' || state === 'suspended' || !isActionableState(state)) {
    return 'amber';
  }
  return 'red';
};

export const ScenarioTimeline = ({ runs, selectedRunId, onSelectRun }: ScenarioTimelineProps) => {
  if (runs.length === 0) {
    return <p>No execution runs yet.</p>;
  }

  return (
    <section className="scenario-timeline">
      <h3>Execution Timeline</h3>
      <ul>
        {runs.map((run) => {
          const cls = barClass(run.state);
          const selected = run.id === selectedRunId;
          return (
            <li key={run.id} className={`timeline-item ${cls}${selected ? ' selected' : ''}`}>
              <button onClick={() => onSelectRun(run.id)}>
                <span>{run.id}</span>
                <span>{run.state}</span>
                <span>{Math.round(run.progress)}%</span>
              </button>
              <div style={{ width: `${run.progress}%` }} className="timeline-progress" />
            </li>
          );
        })}
      </ul>
    </section>
  );
};
