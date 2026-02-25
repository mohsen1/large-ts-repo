import { memo, type ReactElement } from 'react';
import type { AnalyticsSignalSummary } from '@domain/recovery-ecosystem-analytics';

export interface ScenarioSimulationPanelProps {
  readonly loading: boolean;
  readonly namespace: string;
  readonly mode: 'seed' | 'simulate' | 'replay';
  readonly summary: AnalyticsSignalSummary | undefined;
  readonly onRun: () => void;
  readonly onReset: () => void;
}

export interface ScenarioControl {
  readonly label: string;
  readonly enabled: boolean;
}

const controls = (loading: boolean): readonly ScenarioControl[] => [
  { label: 'run-seed', enabled: !loading },
  { label: 'run-sim', enabled: !loading },
  { label: 'clear', enabled: !loading },
];

export const ScenarioSimulationPanel = memo(
  ({
    loading,
    namespace,
    mode,
    summary,
    onRun,
    onReset,
  }: ScenarioSimulationPanelProps): ReactElement => {
    const active = controls(loading);
    return (
      <section>
        <header>
          <h3>{`Scenario Simulator (${mode})`}</h3>
          <small>{namespace}</small>
        </header>
        <section>
          <p>{summary ? `score: ${summary.score}` : 'no-summary'}</p>
          <p>{summary ? `warnings: ${summary.warningCount}` : '...'}</p>
          <p>{summary ? `critical: ${summary.criticalCount}` : '...'}</p>
          <p>{summary ? `signals: ${summary.signalCount}` : '...'}</p>
        </section>
        <menu>
          {active.map((control) => (
            <li key={control.label}>
              <button
                type="button"
                disabled={!control.enabled}
                onClick={control.label === 'clear' ? onReset : onRun}
              >
                {control.label}
              </button>
            </li>
          ))}
        </menu>
      </section>
    );
  },
);
