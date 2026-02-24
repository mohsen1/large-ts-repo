import { type ReactElement } from 'react';
import { useRecoveryLabConsoleRuntime } from '../hooks/useRecoveryLabConsoleRuntime';
import { RecoveryLabTopologyMatrix } from './RecoveryLabTopologyMatrix';

interface LabConsoleRuntimeSummaryProps {
  readonly title: string;
}

const header = (text: string): string => `⚙️ ${text}`;

const format = (value: string | number): string => `${value}`;

export const LabConsoleRuntimeSummary = ({ title }: LabConsoleRuntimeSummaryProps): ReactElement => {
  const { state, status, timeline, snapshot, history } = useRecoveryLabConsoleRuntime();

  return (
    <section className="lab-console-runtime-summary">
      <h2>{header(title)}</h2>
      <p>{status}</p>
      <p>{state.runText}</p>
      <p>mode: {state.metadata.mode}</p>
      <p>scope: {state.metadata.scope}</p>
      <p>plugins executed: {format(state.pluginCount)}</p>
      {snapshot ? <p>{`run=${snapshot.runId} session=${snapshot.sessionId}`}</p> : null}
      <div>
        <h3>Timeline</h3>
        <ul>
          {timeline.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
      <RecoveryLabTopologyMatrix title="timeline matrix" events={history.flatMap((entry) => entry.timeline.map((point) => point.at))} />
    </section>
  );
};
