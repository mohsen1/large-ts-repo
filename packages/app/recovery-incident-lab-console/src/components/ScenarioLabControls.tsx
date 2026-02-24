import { type ReactElement, useMemo, useState, type ChangeEvent } from 'react';
import type { OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';
import type { OrchestratorStatus } from '@service/recovery-incident-lab-orchestrator';

interface Props {
  readonly statusText: string;
  readonly isBusy: boolean;
  readonly summary?: string;
  readonly canRun: boolean;
  readonly onRun: () => void;
  readonly onReset: () => void;
  readonly output?: OrchestratorOutput;
  readonly status?: OrchestratorStatus;
}

export const ScenarioLabControls = ({ statusText, isBusy, summary, canRun, onRun, onReset, output, status }: Props): ReactElement => {
  const [speed, setSpeed] = useState(5);
  const badge = useMemo(() => (isBusy ? 'running' : 'ready'), [isBusy]);

  const onSpeedChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSpeed(Number(event.currentTarget.value));
  };

  return (
    <section className="scenario-lab-controls">
      <h3>Execution controls</h3>
      <p data-testid="lab-badge">state: {badge}</p>
      <p>{statusText}</p>
      <label htmlFor="speed">Speed</label>
      <input id="speed" type="range" min={1} max={20} value={speed} onChange={onSpeedChange} />
      <p>Target throughput: {speed}</p>
      <p>{summary ?? 'No summary yet'}</p>
      <p>{status?.state ? `state: ${status.state}` : ''}</p>
      <div>
        <button type="button" disabled={!canRun || isBusy} onClick={onRun}>Run scenario</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
      <pre>{output ? JSON.stringify(output, null, 2) : 'no output'}</pre>
    </section>
  );
};
