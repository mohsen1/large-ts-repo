import type { RecoveryTimeline, RecoveryTimelineEvent } from './types';

export interface TimelineHealth {
  timelineId: string;
  completedCount: number;
  blockedCount: number;
  runningCount: number;
  failureRate: number;
  riskScoreAverage: number;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function aggregateHealth(events: RecoveryTimelineEvent[]): TimelineHealth {
  const timelineId = events[0]?.timelineId ?? 'unknown';
  const completedCount = events.filter((event) => event.state === 'completed').length;
  const blockedCount = events.filter((event) => event.state === 'blocked').length;
  const runningCount = events.filter((event) => event.state === 'running').length;
  const failureCount = events.filter((event) => event.state === 'failed').length;
  const riskScoreAverage = events.length === 0 ? 0 : safeDivide(events.reduce((sum, event) => sum + event.riskScore, 0), events.length);
  const failureRate = safeDivide(failureCount * 100, events.length);

  return {
    timelineId,
    completedCount,
    blockedCount,
    runningCount,
    failureRate: Number(failureRate.toFixed(2)),
    riskScoreAverage: Number(riskScoreAverage.toFixed(2)),
  };
}

export function buildSummary(timeline: RecoveryTimeline): string {
  const health = aggregateHealth(timeline.events);
  const completedPercent = timeline.events.length === 0 ? 0 : Math.round((health.completedCount / timeline.events.length) * 100);
  return `${timeline.name}: ${completedPercent}% complete, active=${health.runningCount}, blocked=${health.blockedCount}, avgRisk=${health.riskScoreAverage}`;
}
