import { RecoveryTimeline } from '@domain/recovery-timeline';

export interface TimelineStudioContext {
  timelines: RecoveryTimeline[];
  selectedTimelineId: string | null;
  loading: boolean;
  filterQuery: string;
  teamFilter: string;
  selectedAction: 'advance' | 'simulate' | 'reopen';
}

export interface TimelineActionState {
  timelineId: string;
  inFlight: boolean;
  lastError: string | null;
  lastWarning: string | null;
}
