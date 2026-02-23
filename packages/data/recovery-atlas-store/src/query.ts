import { type RecoveryAtlasFilter, type RecoveryAtlasSnapshot, type RecoveryAtlasWindowId, type RecoveryAtlasIncidentId } from '@domain/recovery-operations-atlas';
import { filterNodes } from '@domain/recovery-operations-atlas';

import { type AtlasStoreRecord, type AtlasStoreQuery } from './models';

const matchesIncident = (record: AtlasStoreRecord, incidentId?: RecoveryAtlasIncidentId): boolean => {
  if (!incidentId) return true;
  return record.snapshot.incidentId === incidentId;
};

const matchesWindow = (record: AtlasStoreRecord, windowId?: RecoveryAtlasWindowId): boolean => {
  if (!windowId) return true;
  return record.snapshot.id === windowId || record.snapshot.graph.nodes.some((node) => node.windowId === windowId);
};

const matchesFilter = (snapshot: RecoveryAtlasSnapshot, filter?: RecoveryAtlasFilter): boolean => {
  if (!filter) return true;
  return filterNodes(snapshot.graph.nodes, filter).length === snapshot.graph.nodes.length;
};

export const matchRecord = (record: AtlasStoreRecord, query: AtlasStoreQuery): boolean => {
  return matchesIncident(record, query.incidentId) && matchesWindow(record, query.windowId) && matchesFilter(record.snapshot, query.filter);
};

export const findByQuery = (
  records: readonly AtlasStoreRecord[],
  query: AtlasStoreQuery,
): readonly AtlasStoreRecord[] => {
  return records.filter((record) => matchRecord(record, query));
};

export const sortByRecency = (records: readonly AtlasStoreRecord[]): readonly AtlasStoreRecord[] => {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const dedupeByWindow = (records: readonly AtlasStoreRecord[]): readonly AtlasStoreRecord[] => {
  const latest = new Map<string, AtlasStoreRecord>();
  for (const record of records) {
    const existing = latest.get(record.snapshot.id);
    if (!existing || existing.updatedAt < record.updatedAt) {
      latest.set(record.snapshot.id, record);
    }
  }
  return sortByRecency(Array.from(latest.values()));
};

export const latestForIncident = (
  records: readonly AtlasStoreRecord[],
  incidentId: RecoveryAtlasIncidentId,
): AtlasStoreRecord | undefined => {
  return sortByRecency(records).find((record) => record.snapshot.incidentId === incidentId);
};
