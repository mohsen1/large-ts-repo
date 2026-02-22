import type { IncidentStoreEvent, IncidentStoreState } from './types';
import { toEventPayload } from './adapters';

export interface AuditTrailRecord {
  readonly incidentId: string;
  readonly type: IncidentStoreEvent['type'];
  readonly payload: Record<string, unknown>;
  readonly emittedAt: string;
  readonly bucket: string;
}

export interface AuditSearchInput {
  readonly incidentId?: string;
  readonly types?: readonly IncidentStoreEvent['type'][];
  readonly since?: string;
  readonly limit?: number;
}

export const toAuditRecord = (event: IncidentStoreEvent): AuditTrailRecord => ({
  incidentId: String(event.incidentId),
  type: event.type,
  payload: event.payload,
  emittedAt: event.emittedAt,
  bucket: event.emittedAt.slice(0, 7),
});

export const toAuditPayload = (record: AuditTrailRecord): string => JSON.stringify(toEventPayload({
  id: `${record.incidentId}:${record.type}:${record.emittedAt}`,
  incidentId: record.incidentId as any,
  type: record.type,
  payload: record.payload,
  emittedAt: record.emittedAt,
}));

export const filterAudit = (events: readonly IncidentStoreEvent[], input: AuditSearchInput = {}): readonly AuditTrailRecord[] => {
  const since = input.since ? Date.parse(input.since) : Number.NEGATIVE_INFINITY;
  const acceptedTypes = input.types ? new Set(input.types) : undefined;

  const matched = events.filter((event) => {
    if (input.incidentId && String(event.incidentId) !== String(input.incidentId)) {
      return false;
    }
    if (acceptedTypes && !acceptedTypes.has(event.type)) {
      return false;
    }
    if (since !== Number.NEGATIVE_INFINITY && Date.parse(event.emittedAt) < since) {
      return false;
    }
    return true;
  });

  const sorted = [...matched].sort((left, right) =>
    right.emittedAt.localeCompare(left.emittedAt),
  );

  return sorted
    .slice(0, input.limit ?? sorted.length)
    .map(toAuditRecord);
};

export const summarizeByBucket = (
  state: IncidentStoreState,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const event of state.events) {
    const record = toAuditRecord(event);
    counts[record.bucket] = (counts[record.bucket] ?? 0) + 1;
  }
  return counts;
};

export const buildAuditReport = (state: IncidentStoreState): {
  readonly incidentCount: number;
  readonly eventCount: number;
  readonly byType: Record<IncidentStoreEvent['type'], number>;
} => {
  const byType = state.events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {} as Record<IncidentStoreEvent['type'], number>);

  return {
    incidentCount: state.incidents.length,
    eventCount: state.events.length,
    byType,
  };
};
