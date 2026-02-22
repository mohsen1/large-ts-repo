import { Brand } from '@shared/core';
import { IncidentRecord } from '@domain/incident-management';

export type IncidentSnapshotId = Brand<string, 'IncidentSnapshotId'>;

export interface IncidentSnapshot {
  id: IncidentSnapshotId;
  incident: IncidentRecord;
  snapshotAt: string;
}

export interface StoreFilters {
  tenantId?: string;
  serviceId?: string;
  state?: IncidentRecord['state'];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface StoreCursor {
  cursor: string;
  limit: number;
}

export const snapshotFromIncident = (incident: IncidentRecord): IncidentSnapshot => ({
  id: `${incident.id}:snapshot:${incident.updatedAt}` as IncidentSnapshotId,
  incident,
  snapshotAt: new Date().toISOString(),
});

export const nextCursor = (value: number): string => `cursor-${value}`;
