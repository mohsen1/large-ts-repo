import { FC } from 'react';
import {
  RecoveryIntent,
  IntentTimeline,
  createTimeline,
  logIntentActivated,
  logIntentMonitoring,
  logIntentCompleted,
  logIntentCreated,
} from '@domain/recovery-cockpit-orchestration-core';

export type IntentTimelinePanelProps = {
  selectedIntent?: RecoveryIntent;
  timeline?: IntentTimeline;
};

const defaultTimeline = (intent?: RecoveryIntent): IntentTimeline =>
  intent
    ? (() => {
        let timeline = createTimeline(intent.intentId);
        timeline = logIntentCreated(intent);
        timeline = logIntentActivated(timeline, intent);
        timeline = logIntentMonitoring(timeline, intent);
        if (intent.status === 'completed') {
          timeline = logIntentCompleted(timeline, intent);
        }
        return timeline;
      })()
    : createTimeline('');

const renderEvent = (intentId: string, index: number, event: IntentTimeline['events'][number]) => (
  <li key={`${intentId}-${index}`}>{`${event.at} ${event.actor}: ${event.type} - ${event.message}`}</li>
);

export const IntentTimelinePanel: FC<IntentTimelinePanelProps> = ({ selectedIntent, timeline }) => {
  if (!selectedIntent) {
    return (
      <section>
        <h3>Intent Timeline</h3>
        <p>Pick an intent to inspect event stream.</p>
      </section>
    );
  }

  const viewTimeline = timeline ?? defaultTimeline(selectedIntent);

  return (
    <section>
      <h3>Intent Timeline</h3>
      <h4>
        {selectedIntent.title} · {selectedIntent.intentId}
      </h4>
      <ul>{viewTimeline.events.map((event, index) => renderEvent(viewTimeline.intentId, index, event))}</ul>
    </section>
  );
};
