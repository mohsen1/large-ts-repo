import { useMemo } from 'react';

type StageState = {
  readonly stage: string;
  readonly selected: boolean;
  readonly required: boolean;
  readonly index: number;
};

export interface ScenarioControlPanelProps {
  readonly title: string;
  readonly stages: readonly StageState[];
  readonly activeProfile: string;
  readonly onRun: () => void;
  readonly onReset: () => void;
  readonly onToggleProfile: (value: string) => void;
  readonly onToggleStage: (stage: string) => void;
  readonly disabled: boolean;
}

export const ScenarioControlPanel = ({
  title,
  stages,
  activeProfile,
  onRun,
  onReset,
  onToggleProfile,
  onToggleStage,
  disabled,
}: ScenarioControlPanelProps) => {
  const profile = useMemo(() => [
    'default',
    'high-fidelity',
    'streaming',
    'batch',
  ], []);

  return (
    <section className="scenario-control-panel">
      <header>
        <h2>{title}</h2>
      </header>
      <div className="scenario-control-panel__row">
        <label>
          Active profile
          <select
            value={activeProfile}
            onChange={(event) => onToggleProfile(event.target.value)}
            disabled={disabled}
          >
            {profile.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="scenario-control-panel__stage-list">
        {stages.map((entry) => {
          const classes = [
            'scenario-control-panel__stage',
            entry.selected ? 'scenario-control-panel__stage--on' : 'scenario-control-panel__stage--off',
            entry.required ? 'scenario-control-panel__stage--required' : '',
          ].join(' ');

          return (
            <button
              key={entry.stage}
              type="button"
              className={classes}
              onClick={() => onToggleStage(entry.stage)}
              disabled={disabled || entry.required}
            >
              <span>{entry.index + 1}</span>
              <span>{entry.stage}</span>
            </button>
          );
        })}
      </div>

      <div className="scenario-control-panel__actions">
        <button type="button" onClick={onRun} disabled={disabled}>
          Execute synthetic flow
        </button>
        <button type="button" onClick={onReset} disabled={disabled}>
          Reset
        </button>
      </div>
    </section>
  );
};
