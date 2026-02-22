import { Brand } from '@shared/core';
import { ControlSignal, ControlTemplate, ControlRunPlan, ControlRunId } from '@domain/operations-control';

export type ArchiveBucketName = Brand<string, 'ArchiveBucketName'>;
export type ArchiveObjectKey = Brand<string, 'ArchiveObjectKey'>;

export interface ControlRunRecord<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  runId: ControlRunId;
  tenantId: Brand<string, 'TenantId'>;
  requestId: Brand<string, 'OperationsRequestId'>;
  plan: ControlRunPlan<TMetadata>;
  observedAt: string;
  archivedAt?: string;
}

export interface RunFilters {
  tenantId?: Brand<string, 'TenantId'>;
  requestId?: string;
  from?: string;
  to?: string;
  hasArchived?: boolean;
}

export interface StoreCursor {
  cursor: string;
  pageSize: number;
}

export interface ControlTimelinePoint {
  runId: string;
  at: string;
  signals: readonly ControlSignal[];
}

export interface ControlTemplateMeta {
  template: ControlTemplate;
  active: number;
  archived: number;
}

export interface PlanArchiveEntry<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  runId: ControlRunId;
  payload: ControlRunRecord<TPayload>;
  bucket: ArchiveBucketName;
  key: ArchiveObjectKey;
}

export const makeRunRecord = (tenantId: string, requestId: string, plan: ControlRunPlan): ControlRunRecord => ({
  runId: plan.id,
  tenantId: tenantId as Brand<string, 'TenantId'>,
  requestId: requestId as Brand<string, 'OperationsRequestId'>,
  plan,
  observedAt: new Date().toISOString(),
});

export const parseStoreCursor = (cursor?: string): StoreCursor => {
  if (!cursor) return { cursor: '0', pageSize: 25 };
  const parts = cursor.split(':');
  const parsed = Number(parts[0]);
  const size = Number(parts[1]);
  if (!Number.isFinite(parsed) || !Number.isFinite(size)) {
    return { cursor: '0', pageSize: 25 };
  }
  return { cursor: String(Math.max(0, parsed)), pageSize: Math.max(1, Math.min(200, Math.floor(size))) };
};

export const encodeStoreCursor = (cursor: number, pageSize: number): string => `${Math.max(0, cursor)}:${Math.max(1, pageSize)}`;
