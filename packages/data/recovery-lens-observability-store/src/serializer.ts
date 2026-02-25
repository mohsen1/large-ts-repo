import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { StoreRecord, StoreSnapshot } from './models';
import type { MetricRecord } from '@domain/recovery-lens-observability-models';
import type { ObserverNamespace } from '@domain/recovery-lens-observability-models';

export type CodecError = {
  readonly code: `codec:${string}`;
  readonly message: string;
};

export const encodeSnapshot = (snapshot: StoreSnapshot): string => JSON.stringify(snapshot);

export const decodeSnapshot = (raw: string): Result<StoreSnapshot, CodecError> => {
  try {
    const parsed = JSON.parse(raw) as StoreSnapshot;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
      return fail({ code: 'codec:structure', message: 'snapshot invalid' });
    }
    return ok(parsed);
  } catch (error) {
    return fail({ code: 'codec:parse', message: (error as Error).message });
  }
};

export const encodePoints = <TPayload extends Record<string, unknown>>(points: readonly MetricRecord<TPayload>[]): string => {
  return JSON.stringify(points);
};

export const decodePoints = (raw: string): Result<readonly Record<string, unknown>[], CodecError> => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fail({ code: 'codec:not-array', message: 'payload must be array' });
    }
    return ok(parsed as readonly Record<string, unknown>[]);
  } catch (error) {
    return fail({ code: 'codec:parse', message: (error as Error).message });
  }
};

export const buildExport = async <TPayload extends Record<string, unknown>>(records: readonly StoreRecord<TPayload>[]): Promise<string> => {
  return JSON.stringify(records);
};

export const parseExport = async (raw: string): Promise<Result<readonly StoreRecord[], Error>> => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.records) && !Array.isArray(parsed)) {
      return fail(new Error('invalid-export'));
    }
    return ok(Array.isArray(parsed) ? parsed as readonly StoreRecord[] : parsed.records);
  } catch (error) {
    return fail(error as Error);
  }
};

export const chunkToMaps = (values: readonly (readonly [string, unknown])[]): readonly Map<string, unknown>[] =>
  values.map(([key, value]) => new Map([[key, value]]));

export const coerceNamespace = (value: string): ObserverNamespace => value as ObserverNamespace;
