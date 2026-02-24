import type { RecoveryTimeline, RecoveryTimelineEvent } from '@domain/recovery-timeline';
import {
  type ConductorMode,
  type ConductorOutput,
  type ConductorResult,
} from '@domain/recovery-timeline-orchestration';

export interface ConductorFilter {
  readonly mode: ConductorMode;
  readonly minRisk: number;
  readonly plugin: string | null;
  readonly ownerTeam: string;
}

export interface ConductorWorkspaceState {
  readonly timelines: RecoveryTimeline[];
  readonly selectedTimelineId: string | null;
  readonly candidateTimelines: readonly string[];
  readonly currentMode: ConductorMode;
  readonly loading: boolean;
  readonly filter: ConductorFilter;
}

export interface ConductorTimelineMetric {
  readonly timelineId: string;
  readonly phaseCount: number;
  readonly failedEvents: number;
  readonly blockedEvents: number;
  readonly avgRisk: number;
}

export type ConductorResultSummary = ConductorResult<{
  output: ConductorOutput;
  trend: readonly number[];
  forecastCount: number;
}>;

export interface ConductorCommandEvent {
  readonly timelineId: string;
  readonly selectedEventId?: string;
  readonly phase: 'ingest' | 'validate' | 'simulate' | 'resolve';
}

export interface ConductorPluginCard {
  readonly pluginId: string;
  readonly namespace: string;
  readonly phase: string;
  readonly enabled: boolean;
  readonly weight: number;
}

export interface ConductorDashboardTile {
  readonly timeline: string;
  readonly phase: string;
  readonly score: number;
  readonly details: string;
}

export function toConductorMetric(timeline: RecoveryTimeline): ConductorTimelineMetric {
  const failedEvents = timeline.events.filter((event) => event.state === 'failed').length;
  const blockedEvents = timeline.events.filter((event) => event.state === 'blocked').length;
  const avgRisk = timeline.events.reduce((acc, event) => acc + event.riskScore, 0) / Math.max(1, timeline.events.length);

  return {
    timelineId: timeline.id,
    phaseCount: timeline.events.length,
    failedEvents,
    blockedEvents,
    avgRisk,
  };
}

export function buildCommandEvent(timeline: RecoveryTimeline, phase: ConductorCommandEvent['phase']): ConductorCommandEvent {
  return {
    timelineId: timeline.id,
    phase,
    selectedEventId: timeline.events.at(-1)?.id,
  };
}
