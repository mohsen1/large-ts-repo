import type { ForecastEnvelope, RecoveryTimeline, RecoveryTimelineEvent, TimelineState } from './types';
import { classifyRisk } from './types';

export interface TimelineShift {
  eventId: string;
  phase: 'delay' | 'acceleration';
  minutes: number;
}

const clampMinutes = (minutes: number): number => Math.max(1, Math.min(480, minutes));

export function forecastRecoveryCompletion(timeline: RecoveryTimeline): ForecastEnvelope {
  const forecastAt = new Date();
  const shifts = buildTimelineShifts(timeline.events);

  const events = timeline.events.map((event) => {
    const shift = shifts.find((s) => s.eventId === event.id);
    const applied = shift ? applyShift(event, shift) : event;
    return applied;
  });

  const expectedReadyAt = events.reduce((latest, event) => (event.end > latest ? event.end : latest), forecastAt);
  const confidence = Math.max(40, 100 - timeline.events.length * 2);

  return {
    scenarioId: `${timeline.id}-forecast`,
    timelineId: timeline.id,
    forecastAt,
    horizonMinutes: Math.max(60, Math.round((expectedReadyAt.getTime() - forecastAt.getTime()) / 60000)),
    confidenceBand: [Math.max(40, confidence - 10), Math.min(98, confidence + 12)],
    events,
  };
}

function buildTimelineShifts(events: RecoveryTimelineEvent[]): TimelineShift[] {
  return events
    .filter((event) => classifyRisk(event.riskScore) === 'high' || classifyRisk(event.riskScore) === 'critical')
    .map((event) => ({
      eventId: event.id,
      phase: event.state === 'blocked' ? 'delay' : 'acceleration',
      minutes: event.state === 'blocked' ? clampMinutes((event.riskScore - 50) * 1.2) : -1 * Math.min(30, event.riskScore / 2),
    }));
}

function applyShift(event: RecoveryTimelineEvent, shift: TimelineShift): RecoveryTimelineEvent {
  const shiftMs = shift.minutes * 60 * 1000;
  return {
    ...event,
    start: new Date(event.start.getTime() + (shift.phase === 'delay' ? shiftMs : -Math.abs(shiftMs))),
    end: new Date(event.end.getTime() + (shift.phase === 'delay' ? shiftMs : -Math.abs(shiftMs))),
  };
}
