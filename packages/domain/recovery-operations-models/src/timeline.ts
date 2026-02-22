import type { RecoverySignal, RunSession, SessionStatus, SessionDecision } from './types';

export interface TimelineEntry {
  readonly at: string;
  readonly kind: 'session_created' | 'status_changed' | 'signal_ingested' | 'decision_made' | 'plan_updated';
  readonly details: string;
}

export interface Timeline {
  readonly session: RunSession;
  readonly events: readonly TimelineEntry[];
}

const buildEntry = (kind: TimelineEntry['kind'], session: RunSession, details: string): TimelineEntry => ({
  at: new Date().toISOString(),
  kind,
  details,
});

export const initializeTimeline = (session: RunSession): Timeline => ({
  session,
  events: [buildEntry('session_created', session, `session ${session.id} initialized`)],
});

export const appendStatus = (timeline: Timeline, status: SessionStatus, details: string): Timeline => ({
  ...timeline,
  session: { ...timeline.session, status, updatedAt: new Date().toISOString() },
  events: [...timeline.events, buildEntry('status_changed', timeline.session, details)],
});

export const appendSignal = (timeline: Timeline, signal: RecoverySignal): Timeline => ({
  ...timeline,
  events: [...timeline.events, buildEntry('signal_ingested', timeline.session, `signal ${signal.id} from ${signal.source}`)],
});

export const appendDecision = (timeline: Timeline, decision: SessionDecision): Timeline => ({
  ...timeline,
  events: [...timeline.events, buildEntry('decision_made', timeline.session, `decision accepted=${decision.accepted}`)],
});

export const appendPlanUpdate = (timeline: Timeline, planName: string): Timeline => ({
  ...timeline,
  events: [...timeline.events, buildEntry('plan_updated', timeline.session, `plan set to ${planName}`)],
});

export const lastEventKind = (timeline: Timeline): TimelineEntry['kind'] => {
  return timeline.events[timeline.events.length - 1]?.kind ?? 'session_created';
};

export const formatTimeline = (timeline: Timeline): string[] =>
  timeline.events.map((event) => `${event.at} - ${event.kind} - ${event.details}`);
