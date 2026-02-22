import type { ContinuityPlanRecord, PlanRunRecord, PlanStoreSnapshot, PlanMetrics } from './models';

const toJson = (value: unknown): string => JSON.stringify(value);

export const encodePlanRecord = (record: ContinuityPlanRecord): string =>
  toJson(record);

export const encodeRunRecord = (record: PlanRunRecord): string => toJson(record);

export const encodeSnapshot = (snapshot: PlanStoreSnapshot): string => toJson(snapshot);

export const encodeMetrics = (metrics: PlanMetrics): string => toJson(metrics);

export const parsePlanRecord = (input: string): ContinuityPlanRecord => JSON.parse(input) as ContinuityPlanRecord;
export const parseRunRecord = (input: string): PlanRunRecord => JSON.parse(input) as PlanRunRecord;
export const parseSnapshot = (input: string): PlanStoreSnapshot => JSON.parse(input) as PlanStoreSnapshot;
export const parseMetrics = (input: string): PlanMetrics => JSON.parse(input) as PlanMetrics;

export const cloneRecord = <T>(record: T): T => JSON.parse(JSON.stringify(record));

export const safeClone = <T>(record: T): T => {
  try {
    return cloneRecord(record);
  } catch {
    return JSON.parse(JSON.stringify(record)) as T;
  }
};
