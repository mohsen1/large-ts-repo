import { withBrand, type CursorPage, type ResultState } from '@shared/core';
import type { Brand } from '@shared/core';
import type { ExperimentPlan, ExperimentIntent, ExperimentRunId, ExperimentPlanId } from '@domain/recovery-autonomy-experiment';

export type ExperimentRecordStatus = 'queued' | 'active' | 'completed' | 'failed';
export type ExperimentRecordVersion = Brand<string, 'RecordVersion'>;
export type ExperimentRecordId = Brand<string, 'ExperimentRecordId'>;
export type ExperimentRecordCursor = Brand<string, 'ExperimentRecordCursor'>;

export interface ExperimentRecord {
  readonly recordId: ExperimentRecordId;
  readonly experimentId: ExperimentPlanId;
  readonly runId: ExperimentRunId;
  readonly status: ExperimentRecordStatus;
  readonly plan: ExperimentPlan;
  readonly intent: ExperimentIntent;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: ExperimentRecordVersion;
}

export interface StoreRecordEnvelope {
  readonly record: ExperimentRecord;
  readonly emittedAt: string;
  readonly source: string;
}

export interface ExperimentRecordFilter {
  readonly tenant?: string;
  readonly runId?: ExperimentRunId;
  readonly status?: ExperimentRecordStatus | readonly ExperimentRecordStatus[];
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface StoreTelemetry {
  readonly recordCount: number;
  readonly statusCounts: Record<ExperimentRecordStatus, number>;
  readonly lastMutationAt: string;
}

export interface ExperimentRepository {
  upsert(record: ExperimentRecord): Promise<ResultState<ExperimentRecord, Error>>;
  hydrateRun(runId: ExperimentRunId): Promise<ExperimentRecord | undefined>;
  query(filter: ExperimentRecordFilter): AsyncIterableIterator<ExperimentRecord>;
  paginate(filter: ExperimentRecordFilter, cursor?: ExperimentRecordCursor): Promise<CursorPage<ExperimentRecord>>;
  remove(runId: ExperimentRunId): Promise<void>;
  telemetry(): StoreTelemetry;
}

export const createRecordId = (runId: ExperimentRunId): ExperimentRecordId =>
  withBrand(`record:${runId}` as const, 'ExperimentRecordId');

export const createRecordVersion = (version: number): ExperimentRecordVersion => withBrand(String(version), 'RecordVersion');
export const parseRecordVersion = (version: ExperimentRecordVersion): number => Number.parseInt(String(version), 10);

export const createStatusCounts = (): Record<ExperimentRecordStatus, number> => ({
  queued: 0,
  active: 0,
  completed: 0,
  failed: 0,
});

export type { ExperimentRunId };
