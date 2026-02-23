import type { RecoveryTimeline, RecoveryTimelineEvent, RecoveryTelemetrySnapshot } from '@domain/recovery-timeline';

export interface StoredTimelineRow {
  timelineId: string;
  timeline: RecoveryTimeline;
  snapshot?: RecoveryTelemetrySnapshot;
  ownerTeam: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineSummary {
  id: string;
  name: string;
  ownerTeam: string;
  eventCount: number;
  completionRatio: number;
  riskHotspots: RecoveryTimelineEvent[];
}

export interface TimelineIndex {
  byId: Record<string, RecoveryTimeline>;
  byTeam: Record<string, string[]>;
}
