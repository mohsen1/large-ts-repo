import { type ReactElement } from 'react';
import { type StudioOrchestratorResult } from '@service/recovery-stress-lab-orchestrator';

export interface RecoveryStressLabStudioTimelineProps {
  readonly result: StudioOrchestratorResult | null;
  readonly title: string;
}

const eventRows = (events: readonly string[]) => {
  if (events.length === 0) {
    return <li>No events</li>;
  }

  return events.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>);
};

export const RecoveryStressLabStudioTimeline = ({ result, title }: RecoveryStressLabStudioTimelineProps): ReactElement => {
  return (
    <section className="recovery-stress-lab-studio-timeline">
      <header>
        <h3>{title}</h3>
      </header>
      <p>manifest: {result?.manifestSignature ?? 'none'}</p>
      <p>ready: {result?.snapshot.ready ? 'yes' : 'no'}</p>
      <ol>{eventRows(result?.events ?? [])}</ol>
      <p>plan runbooks: {result?.snapshot.plan?.runbooks.length ?? 0}</p>
    </section>
  );
};
