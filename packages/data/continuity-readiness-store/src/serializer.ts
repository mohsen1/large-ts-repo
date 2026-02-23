import { ok, fail, type Result } from '@shared/result';
import type {
  ReadinessRecordEnvelope,
  ReadinessWindow,
  ReadinessRunRecord,
  ReadinessMetrics,
} from './types';
import { readinessRecordId, readinessWindowId } from './types';
import { ContinuityReadinessIds } from '@domain/recovery-continuity-readiness';

const parseWindowValue = (input: unknown): ReadinessWindow | null => {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as { id: unknown; tenantId: unknown; from: unknown; to: unknown };
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.tenantId !== 'string' ||
    typeof candidate.from !== 'string' ||
    typeof candidate.to !== 'string'
  ) {
    return null;
  }

  if (Date.parse(candidate.from) > Date.parse(candidate.to)) {
    return null;
  }

  return {
    id: readinessWindowId(candidate.id),
    tenantId: ContinuityReadinessIds.tenant(candidate.tenantId),
    from: candidate.from,
    to: candidate.to,
  };
};

export const parseReadinessRecord = (input: unknown): Result<ReadinessRecordEnvelope, Error> => {
  if (!input || typeof input !== 'object') {
    return fail(new Error('invalid-readiness-record'));
  }
  const candidate = input as Record<string, unknown>;
  const surface = candidate.surface;
  if (!surface) {
    return fail(new Error('record missing surface'));
  }
  const window = parseWindowValue(candidate.window);
  if (!window) {
    return fail(new Error('invalid record window'));
  }
  if (typeof candidate.id !== 'string' || typeof candidate.tenantId !== 'string' || typeof candidate.createdAt !== 'string' || typeof candidate.createdBy !== 'string') {
    return fail(new Error('invalid record fields'));
  }

  return ok({
    id: readinessRecordId(candidate.id),
    tenantId: ContinuityReadinessIds.tenant(candidate.tenantId),
    surface: surface as ReadinessRecordEnvelope['surface'],
    createdAt: candidate.createdAt,
    window,
    createdBy: candidate.createdBy,
  });
};

export const parseReadinessWindow = (input: unknown): Result<ReadinessWindow, Error> => {
  const parsed = parseWindowValue(input);
  return parsed ? ok(parsed) : fail(new Error('invalid-readiness-window'));
};

export const encodeReadinessRecord = (record: ReadinessRecordEnvelope): string => JSON.stringify(record);
export const decodeReadinessRecord = (input: string): Result<ReadinessRecordEnvelope, Error> => parseReadinessRecord(JSON.parse(input));

export const encodeRunRecord = (record: ReadinessRunRecord): string => JSON.stringify(record);
export const decodeRunRecord = (input: string): Result<ReadinessRunRecord, Error> => {
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== 'object') {
    return fail(new Error('invalid run record'));
  }
  const envelope = parsed as Record<string, unknown>;
  if (!envelope.run || !envelope.snapshot || typeof envelope.id !== 'string') {
    return fail(new Error('invalid run record'));
  }
  return ok({
    ...envelope,
    id: readinessRecordId(envelope.id as string) as ReadinessRunRecord['id'],
    run: envelope.run as ReadinessRunRecord['run'],
    snapshot: envelope.snapshot as ReadinessRunRecord['snapshot'],
    archived: Boolean(envelope.archived),
  });
};

export const parseReadinessMetrics = (input: unknown): Result<ReadinessMetrics, Error> => {
  if (!input || typeof input !== 'object') {
    return fail(new Error('invalid metrics'));
  }
  const candidate = input as {
    tenantId?: unknown;
    activeRuns?: unknown;
    archivedRuns?: unknown;
    avgRisk?: unknown;
    lastUpdated?: unknown;
  };

  if (
    typeof candidate.tenantId !== 'string' ||
    typeof candidate.activeRuns !== 'number' ||
    typeof candidate.archivedRuns !== 'number' ||
    typeof candidate.avgRisk !== 'number' ||
    typeof candidate.lastUpdated !== 'string'
  ) {
    return fail(new Error('invalid metrics'));
  }

  return ok({
    tenantId: ContinuityReadinessIds.tenant(candidate.tenantId),
    activeRuns: candidate.activeRuns,
    archivedRuns: candidate.archivedRuns,
    avgRisk: candidate.avgRisk,
    lastUpdated: candidate.lastUpdated,
  });
};

export const encodeMetrics = (metrics: ReadinessMetrics): string => JSON.stringify(metrics);
export const decodeMetrics = (input: string): Result<ReadinessMetrics, Error> => parseReadinessMetrics(JSON.parse(input));
