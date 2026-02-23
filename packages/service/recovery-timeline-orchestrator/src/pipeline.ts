import type { ForecastEnvelope, RecoveryTimeline, RecoveryTimelineEvent, TimelineState } from '@domain/recovery-timeline';
import { forecastRecoveryCompletion } from '@domain/recovery-timeline';
import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';

export interface PipelineContext {
  repository: InMemoryTimelineRepository;
  timelineId: string;
}

export async function computeForecast(repository: InMemoryTimelineRepository, timelineId: string): Promise<ForecastEnvelope | undefined> {
  const loaded = repository.load(timelineId);
  if (!loaded.ok) {
    return undefined;
  }
  return forecastRecoveryCompletion(loaded.value);
}

export function advanceTimelineEvents(timeline: RecoveryTimeline, allowOverride: boolean): RecoveryTimeline {
  const nextEvents = timeline.events.map((event) => {
    if (!allowOverride && event.state === 'failed') {
      return event;
    }

    const nextState = nextStateFor(event);
    return {
      ...event,
      state: nextState,
    };
  });

  return {
    ...timeline,
    events: nextEvents,
    updatedAt: new Date(),
  };
}

function nextStateFor(event: RecoveryTimelineEvent): TimelineState {
  const next = event.state === 'completed' ? event.state : event.riskScore > 90 ? 'blocked' : 'running';
  if (event.state === 'queued' || event.state === 'running') {
    return next === 'running' ? 'completed' : next;
  }
  return event.state;
}
