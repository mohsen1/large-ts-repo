import type {
  IncidentRecord,
  IncidentPlan,
  IncidentEvent,
  OrchestrationRun,
} from '@domain/recovery-incident-orchestration';
import type { IncidentStoreEvent } from './types';

export const eventTypes = ['created', 'updated', 'plan_added', 'plan_approved', 'resolved', 'escalated'] as const;

export interface EventBusEvent {
  readonly type: (typeof eventTypes)[number];
  readonly incidentId: string;
  readonly payload: Record<string, unknown>;
}

const baseEvent = (incidentId: string, type: IncidentStoreEvent['type'], payload: Record<string, unknown>): IncidentStoreEvent => ({
  id: `${incidentId}:${type}:${Date.now()}`,
  incidentId: incidentId as IncidentEvent['incidentId'],
  type,
  payload,
  emittedAt: new Date().toISOString(),
});

export const buildCreatedEvent = (incident: IncidentRecord): IncidentStoreEvent =>
  baseEvent(incident.id, 'created', {
    title: incident.title,
    severity: incident.severity,
    tenantId: incident.scope.tenantId,
    clusterId: incident.scope.clusterId,
  });

export const buildPlanEvent = (plan: IncidentPlan): IncidentStoreEvent =>
  baseEvent(plan.incidentId, 'plan_added', {
    planId: plan.id,
    riskScore: plan.riskScore,
    nodeCount: plan.route.nodes.length,
  });

export const buildResolvedEvent = (incident: IncidentRecord): IncidentStoreEvent =>
  baseEvent(incident.id, 'resolved', {
    resolvedAt: incident.resolvedAt,
    signalCount: incident.signals.length,
  });

export const runToEvent = (run: OrchestrationRun): IncidentStoreEvent =>
  baseEvent(String(run.planId), run.state === 'failed' ? 'escalated' : 'updated', {
    runId: run.id,
    startedAt: run.startedAt,
    state: run.state,
  });

export const toBusEvent = (event: IncidentStoreEvent): EventBusEvent => ({
  type: event.type,
  incidentId: String(event.incidentId),
  payload: event.payload,
});

export const isTerminalType = (type: (typeof eventTypes)[number]): boolean =>
  type === 'resolved' || type === 'escalated';

export const latestEventOfType = (events: readonly IncidentStoreEvent[], type: (typeof eventTypes)[number]): IncidentStoreEvent | undefined =>
  [...events].filter((entry) => entry.type === type).sort((a, b) => a.emittedAt.localeCompare(b.emittedAt)).pop();
