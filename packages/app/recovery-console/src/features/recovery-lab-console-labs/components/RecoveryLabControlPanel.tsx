import { FormEvent, useMemo, useState } from 'react';
import type { OrchestrationMode, RuntimeWorkspaceState } from '../types';

export interface RecoveryLabControlPanelProps {
  readonly state: RuntimeWorkspaceState;
  readonly onRun: (signal: number, payload: Record<string, unknown>) => Promise<void>;
  readonly onModeChange: (mode: OrchestrationMode) => void;
  readonly onSignalChange: (signal: string) => void;
  readonly onReset: () => void;
}

const MODES = [
  'observe',
  'simulate',
  'simulate+policy',
  'audit-only',
] as const satisfies readonly OrchestrationMode[];

const asMode = (value: string): OrchestrationMode =>
  (MODES as readonly string[]).includes(value) ? (value as OrchestrationMode) : 'simulate';

export const RecoveryLabControlPanel = ({
  state,
  onRun,
  onModeChange,
  onSignalChange,
  onReset,
}: RecoveryLabControlPanelProps) => {
  const [signalValue, setSignalValue] = useState('0');
  const [notes, setNotes] = useState('');

  const summary = useMemo(() => {
    const status = state.isBusy ? 'running' : 'ready';
    return `${state.tenantId} · ${state.workspaceId} · ${state.mode} · ${status} · ${state.runCount}`;
  }, [state.tenantId, state.workspaceId, state.mode, state.isBusy, state.runCount]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(signalValue);
    await onRun(Number.isFinite(parsed) ? parsed : 0, {
      notes,
      generatedBy: state.operator,
      severity: state.severity,
      selectedPlugin: state.selectedPlugin,
    });
  };

  return (
    <section className="recovery-lab-control-panel">
      <header>
        <h2>Recovery Lab Orchestrator</h2>
        <p>{summary}</p>
      </header>
      <form onSubmit={onSubmit}>
        <label>
          Mode
          <select value={state.mode} onChange={(event) => onModeChange(asMode(event.currentTarget.value))}>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label>
          Signal Value
          <input
            type="number"
            min={0}
            max={100}
            step={0.25}
            value={signalValue}
            onChange={(event) => setSignalValue(event.currentTarget.value)}
          />
        </label>
        <label>
          Signal
          <input
            type="text"
            value={state.signal}
            onChange={(event) => onSignalChange(event.currentTarget.value)}
          />
        </label>
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
        </label>
        <div className="control-actions">
          <button type="submit" disabled={state.isBusy}>
            {state.isBusy ? 'Running…' : 'Run scenario'}
          </button>
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      </form>
      <footer>
        <strong>Output</strong>
        <pre>{state.outputSummary}</pre>
      </footer>
    </section>
  );
};
