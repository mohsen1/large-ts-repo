import { memo } from 'react';

interface CampaignTimelineItem {
  readonly phase: string;
  readonly at: string;
}

interface TimelineProps {
  readonly items: readonly CampaignTimelineItem[];
  readonly isRunning: boolean;
}

export const RecoveryStressLabCampaignTimeline = memo((props: TimelineProps) => {
  if (props.items.length === 0) {
    return (
      <section>
        <h2>Campaign Timeline</h2>
        <p>No timeline yet</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Campaign Timeline</h2>
      <p>{`running: ${props.isRunning}`}</p>
      <ol>
        {props.items.map((item) => (
          <li key={`${item.phase}-${item.at}`}>{`${item.phase} @ ${item.at}`}</li>
        ))}
      </ol>
    </section>
  );
});

RecoveryStressLabCampaignTimeline.displayName = 'RecoveryStressLabCampaignTimeline';
