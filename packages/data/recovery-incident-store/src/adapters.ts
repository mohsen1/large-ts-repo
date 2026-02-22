import type { IncidentPlan, IncidentRecord } from '@domain/recovery-incident-orchestration';
import type { IncidentPlanRecord, IncidentRunRecord, IncidentStoreEvent, IncidentStoreSnapshot } from './types';

export interface IncidentEntity {
  readonly partition: string;
  readonly sortKey: string;
  readonly ttl?: number;
  readonly blob: string;
}

export const serializeIncidentRecord = (incident: IncidentRecord): IncidentEntity => ({
  partition: incident.scope.tenantId,
  sortKey: `${incident.scope.clusterId}#${incident.id}`,
  blob: JSON.stringify(incident),
});

export const hydrateIncidentRecord = (entity: IncidentEntity): IncidentRecord => {
  return JSON.parse(entity.blob) as IncidentRecord;
};

export const serializePlan = (record: IncidentPlanRecord): IncidentEntity => ({
  partition: record.incidentId as string,
  sortKey: `PLAN#${String(record.id)}`,
  blob: JSON.stringify(record.plan),
  ttl: Date.now() + 24 * 60 * 60 * 1000,
});

export const serializeRun = (record: IncidentRunRecord): IncidentEntity => ({
  partition: record.planId as string,
  sortKey: `RUN#${record.itemId}`,
  blob: JSON.stringify(record.run),
  ttl: Date.now() + 7 * 24 * 60 * 60 * 1000,
});

export const toEventPayload = (item: IncidentStoreEvent): IncidentEntity => ({
  partition: item.incidentId as string,
  sortKey: `EVENT#${item.id}`,
  blob: JSON.stringify(item.payload),
});
