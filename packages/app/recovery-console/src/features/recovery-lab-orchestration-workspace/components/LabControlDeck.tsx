import type { FormEvent } from 'react';
import { useMemo } from 'react';
import type { LabCommand, LabSignalEvent, LabScenarioOverview } from '../types';

interface LabControlDeckProps {
  readonly overview: LabScenarioOverview;
  readonly commands: readonly LabCommand[];
  readonly signals: readonly LabSignalEvent[];
  readonly isBusy: boolean;
  readonly onRefresh: () => void;
  readonly onRun: () => void;
  readonly onToggle: (id: string) => void;
}

export const LabControlDeck = ({
  overview,
  commands,
  signals,
  isBusy,
  onRefresh,
  onRun,
  onToggle,
}: LabControlDeckProps) => {
  const latest = useMemo(() => signals.at(-1)?.value ?? 0, [signals]);

  const handleRefresh = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRefresh();
  };

  const onRunClick = () => {
    onRun();
  };

  return (
    <section className="lab-control-deck">
      <header>
        <h2>Recovery Lab Workspace</h2>
        <p>{overview.name}</p>
        <p>{`Owner ${overview.owner}`}</p>
      </header>
      <div className="lab-control-panel">
        <form onSubmit={handleRefresh}>
          <button type="submit" disabled={isBusy}>
            Refresh
          </button>
          <button type="button" onClick={onRunClick} disabled={isBusy}>
            {isBusy ? 'Running' : 'Execute Plan'}
          </button>
        </form>
        <p>{`Signals: ${signals.length}`}</p>
        <p>{`Latest value: ${latest}`}</p>
      </div>
      <ul className="lab-command-list">
        {commands.map((command) => (
          <li key={command.id}>
            <button type="button" onClick={() => onToggle(command.id)}>
              {command.enabled ? 'disable' : 'enable'}
            </button>
            <span>{command.title}</span>
            <span>{command.stage}</span>
            <span>{command.weight}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
