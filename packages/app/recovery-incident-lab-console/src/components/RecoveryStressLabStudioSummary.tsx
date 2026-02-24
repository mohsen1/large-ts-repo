import { type ReactElement } from 'react';

export interface RecoveryStressLabStudioSummaryProps {
  readonly planCount: number;
  readonly signalCount: number;
  readonly simulationSummary: string;
  readonly payload: readonly string[];
  readonly summary: string;
}

export const RecoveryStressLabStudioSummary = ({
  planCount,
  signalCount,
  simulationSummary,
  payload,
  summary,
}: RecoveryStressLabStudioSummaryProps): ReactElement => {
  return (
    <section className="recovery-stress-lab-studio-summary">
      <h2>Studio summary</h2>
      <p>{summary}</p>
      <p>plans: {planCount}</p>
      <p>signals: {signalCount}</p>
      <p>simulation: {simulationSummary}</p>
      <ul>
        {payload.length === 0 ? <li>no payload</li> : payload.map((entry) => <li key={entry}>{entry}</li>)}
      </ul>
    </section>
  );
};
