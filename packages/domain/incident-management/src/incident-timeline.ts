import { withBrand } from '@shared/core';
import type { IncidentRecord, IncidentState, IncidentSeverity, ServiceId, IncidentId, RunbookStep, OwnerId } from './types';

export type IncidentTimelineId = ReturnType<typeof withBrand>;

export interface IncidentTimelineEvent {
  readonly timelineId: IncidentTimelineId;
  readonly incidentId: IncidentId;
  readonly at: string;
  readonly state: IncidentState;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly actor?: OwnerId;
}

export interface TimelineBucket {
  readonly state: IncidentState;
  readonly count: number;
  readonly since: string;
  readonly until: string;
}

export interface TimelineQuery {
  readonly tenantId?: string;
  readonly serviceId?: ServiceId;
  readonly states?: readonly IncidentState[];
  readonly severities?: readonly IncidentSeverity[];
  readonly from?: string;
  readonly to?: string;
}

export interface TimelineSegment {
  readonly id: IncidentTimelineId;
  readonly state: IncidentState;
  readonly start: string;
  readonly end: string;
}

const timelineId = (incidentId: string, suffix: string): IncidentTimelineId =>
  withBrand(`${incidentId}:${suffix}`, 'IncidentTimelineId');

const asDate = (value: string): number => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
};

export const buildTimelineEvents = (
  incident: IncidentRecord,
  includeAnnotations = true,
): readonly IncidentTimelineEvent[] => {
  const events: IncidentTimelineEvent[] = [
    {
      timelineId: timelineId(incident.id, 'created'),
      incidentId: incident.id,
      at: incident.createdAt,
      state: incident.state,
      description: 'incident-created',
      metadata: {
        title: incident.title,
        tenantId: incident.tenantId,
        serviceId: incident.serviceId,
      },
    },
    {
      timelineId: timelineId(incident.id, 'updated'),
      incidentId: incident.id,
      at: incident.updatedAt,
      state: incident.state,
      description: 'incident-updated',
      metadata: {
        confidence: incident.triage.confidence,
        labels: incident.triage.labels,
      },
    },
  ];

  if (incident.currentStep) {
    events.push({
      timelineId: timelineId(incident.id, 'step'),
      incidentId: incident.id,
      at: incident.updatedAt,
      state: incident.state,
      description: `step:${incident.currentStep}`,
      metadata: { currentStep: incident.currentStep },
    });
  }

  if (includeAnnotations) {
    events.push({
      timelineId: timelineId(incident.id, 'annotation'),
      incidentId: incident.id,
      at: new Date().toISOString(),
      state: incident.state,
      description: 'annotation-generated',
      metadata: {
        source: 'incident-timeline',
        hasRunbook: Boolean(incident.runbook),
        runbookId: incident.runbook?.id,
      },
      actor: incident.runbook?.owner,
    });
  }

  return events.slice().sort((left, right) => asDate(left.at) - asDate(right.at));
};

export const reduceByState = (incidents: readonly IncidentRecord[]): readonly TimelineBucket[] => {
  const grouped = incidents.reduce(
    (acc, incident) => {
      const key = incident.state;
      const current = acc.get(key) ?? 0;
      acc.set(key, current + 1);
      return acc;
    },
    new Map<IncidentState, number>(),
  );
  const now = Date.now();
  return [...grouped.entries()].map(([state, count]) => ({
    state,
    count,
    since: new Date(now - 3600_000).toISOString(),
    until: new Date(now).toISOString(),
  }));
};

export const buildSegments = (
  incidents: readonly IncidentRecord[],
): readonly TimelineSegment[] => {
  const output: TimelineSegment[] = [];
  for (const incident of incidents) {
    const steps = incident.runbook?.steps ?? [];
    let pointer = asDate(incident.createdAt);
    for (const step of steps) {
      const start = pointer;
      pointer += step.estimateSeconds * 1000;
      output.push({
        id: timelineId(incident.id, `step:${step.key}`),
        state: incident.state,
        start: new Date(start).toISOString(),
        end: new Date(pointer).toISOString(),
      });
    }
  }
  return output;
};

export const buildTimelineBuckets = (
  incidents: readonly IncidentRecord[],
  query?: TimelineQuery,
): readonly TimelineBucket[] => {
  const filtered = incidents.filter((incident) => {
    if (query?.tenantId && incident.tenantId !== query.tenantId) return false;
    if (query?.serviceId && incident.serviceId !== query.serviceId) return false;
    if (query?.states?.length && !query.states.includes(incident.state)) return false;
    if (query?.severities?.length && !query.severities.includes(incident.triage.severity)) return false;
    if (query?.from && Date.parse(incident.createdAt) < Date.parse(query.from)) return false;
    if (query?.to && Date.parse(incident.updatedAt) > Date.parse(query.to)) return false;
    return true;
  });
  return reduceByState(filtered);
};

export const annotateTimeline = (incident: IncidentRecord): readonly IncidentTimelineEvent[] =>
  buildTimelineEvents(incident, true).map((event, index) => ({
    ...event,
    timelineId: timelineId(incident.id, `annotation:${index}`),
    description: `${index + 1}:${event.description}`,
    metadata: {
      ...event.metadata,
      timelineIndex: index,
    },
  }));

export const stepWindowSummary = (step: RunbookStep): number => step.estimateSeconds + step.prerequisites.length * 5;
