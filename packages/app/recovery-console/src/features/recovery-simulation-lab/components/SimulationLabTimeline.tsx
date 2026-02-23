import type { SimulationCommand, SimulationRunRecord } from '@domain/recovery-simulation-core';

interface SimulationLabTimelineProps {
  readonly run?: SimulationRunRecord;
  readonly commands: readonly SimulationCommand[];
  readonly selectedCommandIndex: number;
  readonly onSelectCommand: (index: number) => void;
}

export const SimulationLabTimeline = ({
  run,
  commands,
  selectedCommandIndex,
  onSelectCommand,
}: SimulationLabTimelineProps) => {
  const runPoints = run?.executedSteps ?? [];
  return (
    <section>
      <h2>Timeline</h2>
      <h3>Commands</h3>
      <ol>
        {commands.map((command, index) => (
          <li key={command.requestId}>
            <button
              type="button"
              onClick={() => onSelectCommand(index)}
              style={{ fontWeight: selectedCommandIndex === index ? 'bold' : 'normal' }}
            >
              {`${command.command}-${command.actorId}-${index}`}
            </button>
          </li>
        ))}
      </ol>
      <h3>Executed steps</h3>
      <ul>
        {runPoints.length === 0 ? (
          <li>No run steps yet</li>
        ) : (
          runPoints.map((step) => (
            <li key={step.stepId}>
              {step.stepId}
              {` ${step.state}`}
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
