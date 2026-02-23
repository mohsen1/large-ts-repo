import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';
import { RecoveryTimeline } from '@domain/recovery-timeline';

export interface TimelineReportRow {
  id: string;
  name: string;
  ownerTeam: string;
  eventCount: number;
  hotSpotCount: number;
}

export function buildTimelineRows(repository: InMemoryTimelineRepository): TimelineReportRow[] {
  return repository.listSummaries().map((summary) => ({
    id: summary.id,
    name: summary.name,
    ownerTeam: summary.ownerTeam,
    eventCount: summary.eventCount,
    hotSpotCount: summary.riskHotspots.length,
  }));
}

export function resolveTimeline(repository: InMemoryTimelineRepository, teamFilter?: string): RecoveryTimeline[] {
  if (!teamFilter) {
    return [];
  }
  return repository.listByTeam(teamFilter);
}
