import type { RecoveryTimeline, RecoveryTimelineEvent, TimelineState } from './types';

export interface TimelineWindow {
  id: string;
  from: Date;
  to: Date;
  events: RecoveryTimelineEvent[];
}

export function getTimelineWindow(timeline: RecoveryTimeline): TimelineWindow {
  const ordered = [...timeline.events].sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    id: `${timeline.id}-window`,
    from: ordered.length ? ordered[0].start : timeline.createdAt,
    to: ordered.length ? ordered.at(-1)?.end ?? timeline.createdAt : timeline.updatedAt,
    events: ordered,
  };
}

export function eventsByState(
  events: RecoveryTimelineEvent[],
): Record<TimelineState, RecoveryTimelineEvent[]> {
  return events.reduce((acc, event) => {
    const current = acc[event.state] ?? [];
    return {
      ...acc,
      [event.state]: [...current, event],
    };
  },
  {
    queued: [] as RecoveryTimelineEvent[],
    running: [] as RecoveryTimelineEvent[],
    blocked: [] as RecoveryTimelineEvent[],
    completed: [] as RecoveryTimelineEvent[],
    failed: [] as RecoveryTimelineEvent[],
  });
}

export function calculateWindowProgress(window: TimelineWindow): number {
  if (window.events.length === 0) {
    return 0;
  }
  const totalDuration = Math.max(1, window.to.getTime() - window.from.getTime());
  const now = Date.now();
  return Math.min(100, Math.max(0, Math.round(((now - window.from.getTime()) / totalDuration) * 100)));
}

export function nextState(event: RecoveryTimelineEvent): RecoveryTimelineEvent['state'] {
  if (event.state === 'queued') {
    return 'running';
  }
  if (event.state === 'running') {
    return 'completed';
  }
  return event.state;
}
