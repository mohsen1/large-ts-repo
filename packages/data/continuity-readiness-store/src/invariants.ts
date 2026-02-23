import { fail, ok, type Result } from '@shared/result';
import { validateEnvelope } from '@domain/recovery-continuity-readiness';
import type {
  ReadinessRecordEnvelope,
  ReadinessSearchResult,
} from './types';

export const ensureTenantMatch = (
  first: string,
  second: string,
): Result<true, Error> => {
  if (!first || !second) {
    return fail(new Error('tenant ids are required'));
  }
  return first === second ? ok(true) : fail(new Error('tenant mismatch'));
};

export const ensureFreshness = (value: string): Result<string, Error> => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return fail(new Error('invalid timestamp'));
  }
  if (Date.now() - time > 1000 * 60 * 60 * 24 * 365) {
    return fail(new Error('record too old'));
  }
  return ok(value);
};

export const validateRecord = (record: ReadinessRecordEnvelope): Result<ReadinessRecordEnvelope, Error> => {
  if (!record.id) {
    return fail(new Error('missing record id'));
  }
  if (!record.tenantId) {
    return fail(new Error('missing tenant id'));
  }
  const envResult = validateEnvelope(record.surface as unknown as Parameters<typeof validateEnvelope>[0], {
    minPlanCount: 1,
    minSignalCoverage: 1,
  });
  if (!envResult.ok) {
    return fail(envResult.error);
  }

  return ok(record);
};

export const validateSearchResult = <T>(result: ReadinessSearchResult<T>): Result<ReadinessSearchResult<T>, Error> => {
  if (result.page < 1 || result.pageSize < 1) {
    return fail(new Error('invalid page'));
  }
  if (result.total < result.rows.length) {
    return fail(new Error('invalid total count'));
  }
  return ok(result);
};
