import type {
  IncidentId,
  IncidentRecord,
  IncidentEvent,
  IncidentPlan,
  OrchestrationPlan,
  RecoveryRoute,
} from './types';

export interface EventEnvelope {
  readonly id: string;
  readonly source: string;
  readonly payload: Record<string, unknown>;
  readonly sentAt: string;
}

export interface IncidentEnvelope {
  readonly id: IncidentId;
  readonly source: string;
  readonly incident: Record<string, unknown>;
  readonly createdAt: string;
}

export const routeToExternalPayload = (route: RecoveryRoute): EventEnvelope => {
  const payload = {
    routeId: String(route.id),
    incidentId: String(route.incidentId),
    owner: route.owner,
    nodeCount: route.nodes.length,
  };

  return {
    id: `${route.incidentId}:route:${route.id}`,
    source: 'recovery-incident-orchestration',
    payload,
    sentAt: new Date().toISOString(),
  };
};

export const planToEvent = (plan: OrchestrationPlan | IncidentPlan): IncidentEvent => {
  return {
    id: `${plan.id}:event` as IncidentEvent['id'],
    incidentId: plan.incidentId,
    type: 'plan_added',
    details: {
      planId: plan.id,
      title: plan.title,
      routeId: plan.route.id,
    },
    createdAt: new Date().toISOString(),
  };
};

export const incidentFromEnvelope = (envelope: IncidentEnvelope): IncidentRecord => {
  const raw = envelope.incident as Record<string, unknown>;
  return {
    id: envelope.id,
    title: String(raw.title ?? 'Recovered Incident'),
    scope: {
      tenantId: String(raw.tenantId ?? 'unknown'),
      clusterId: String(raw.clusterId ?? 'default'),
      region: String(raw.region ?? 'us-east-1'),
      serviceName: String(raw.serviceName ?? 'incident-service'),
    },
    severity: (String(raw.severity ?? 'medium') as IncidentRecord['severity']),
    summary: String(raw.summary ?? ''),
    labels: Array.isArray(raw.labels) ? (raw.labels as string[]) : [],
    openedAt: String(raw.openedAt ?? envelope.createdAt),
    detectedAt: String(raw.detectedAt ?? envelope.createdAt),
    resolvedAt: typeof raw.resolvedAt === 'string' ? String(raw.resolvedAt) : undefined,
    snapshots: Array.isArray(raw.snapshots) ? (raw.snapshots as IncidentRecord['snapshots']) : [],
    signals: Array.isArray(raw.signals) ? (raw.signals as IncidentRecord['signals']) : [],
    metadata: {
      importedAt: envelope.createdAt,
      source: envelope.source,
    },
  };
};
