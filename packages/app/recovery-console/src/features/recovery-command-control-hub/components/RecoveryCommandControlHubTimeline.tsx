import { type HubExecution, timelineBlocks } from '@domain/recovery-command-control-hub';

interface RecoveryCommandControlHubTimelineProps {
  readonly execution?: HubExecution;
}

export const RecoveryCommandControlHubTimeline = ({ execution }: RecoveryCommandControlHubTimelineProps) => {
  if (!execution) {
    return <section>No execution in progress.</section>;
  }

  const windows = timelineBlocks(execution.run.runId, execution.controlWindow.startsAt, 8);

  return (
    <section>
      <h3>Execution Timeline</h3>
      <ol>
        {windows.map((window) => (
          <li key={`${window.runId}-${window.start}`}>
            {window.start} to {window.end}
          </li>
        ))}
      </ol>
    </section>
  );
};
