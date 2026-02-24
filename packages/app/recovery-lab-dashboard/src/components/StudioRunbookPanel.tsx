import { useMemo } from 'react';

interface StudioRunbookPanelProps {
  readonly runId: string;
  readonly traces: readonly string[];
  readonly onReplay: () => void;
}

interface RunbookStep {
  readonly step: string;
  readonly index: number;
  readonly active: boolean;
}

const parseStep = (value: string, index: number): RunbookStep => ({
  step: value,
  index,
  active: index % 2 === 0,
});

export const StudioRunbookPanel = ({ runId, traces, onReplay }: StudioRunbookPanelProps) => {
  const steps = useMemo<readonly RunbookStep[]>(() => traces.map(parseStep), [traces]);

  const summary = useMemo(
    () => steps.map((entry) => (entry.active ? '+' : '-')).join(','),
    [steps],
  );

  return (
    <section>
      <h3>Runbook {runId}</h3>
      <p>{summary}</p>
      <ul>
        {steps.map((entry) => (
          <li key={`${runId}:${entry.index}`} style={{ color: entry.active ? '#0f766e' : '#6b7280' }}>
            {entry.step}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReplay}>
        replay
      </button>
    </section>
  );
};
