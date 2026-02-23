import { RecoveryTimeline, RecoveryTelemetrySnapshot } from '@domain/recovery-timeline';
import { StoredTimelineRow, TimelineSummary } from './models';

export function toStoredRow(timeline: RecoveryTimeline, snapshot?: RecoveryTelemetrySnapshot): StoredTimelineRow {
  return {
    timelineId: timeline.id,
    timeline,
    snapshot,
    ownerTeam: timeline.ownerTeam,
    archived: false,
    createdAt: timeline.createdAt.toISOString(),
    updatedAt: timeline.updatedAt.toISOString(),
  };
}

export function fromStoredRow(row: StoredTimelineRow): RecoveryTimeline {
  return {
    ...row.timeline,
  };
}

export function summarize(timeline: RecoveryTimeline): TimelineSummary {
  const completed = timeline.events.filter((event) => event.state === 'completed').length;
  const eventCount = timeline.events.length;
  const completionRatio = eventCount === 0 ? 0 : completed / eventCount;
  const riskHotspots = [...timeline.events]
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 3);

  return {
    id: timeline.id,
    name: timeline.name,
    ownerTeam: timeline.ownerTeam,
    eventCount,
    completionRatio: Number(completionRatio.toFixed(3)),
    riskHotspots,
  };
}
