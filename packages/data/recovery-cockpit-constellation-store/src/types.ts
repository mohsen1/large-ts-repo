import type { NoInfer, Brand } from '@shared/type-level';
import type { PlanId, RecoveryPlan, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import type {
  ConstellationMode,
  ConstellationPlanEnvelope,
  ConstellationRunId,
  ConstellationTemplateId,
  ConstellationNode,
} from '@domain/recovery-cockpit-constellation-core';

export type RunRowId = Brand<string, 'ConstellationRunRowId'>;

export type StoreAuditAction = 'create' | 'update' | 'append' | 'drop' | 'rebuild';

export type StoreAuditTrail = {
  readonly at: UtcIsoTimestamp;
  readonly action: StoreAuditAction;
  readonly correlationId: string;
  readonly details?: string;
};

export interface ConstellationRunSnapshot {
  readonly runId: ConstellationRunId;
  readonly planId: PlanId;
  readonly mode: ConstellationMode;
  readonly createdAt: UtcIsoTimestamp;
  readonly updatedAt: UtcIsoTimestamp;
  readonly plan: RecoveryPlan;
  readonly topologyNodes: readonly ConstellationNode[];
  readonly planEnvelope: ConstellationPlanEnvelope;
  readonly templateId: ConstellationTemplateId;
  readonly audit: readonly StoreAuditTrail[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ConstellationStoreRecord<TRecord = unknown> {
  readonly key: string;
  readonly value: TRecord;
  readonly version: number;
  readonly updatedAt: UtcIsoTimestamp;
  readonly tags: readonly string[];
}

export interface ConstellationRunQuery {
  readonly planId?: PlanId;
  readonly mode?: ConstellationMode;
  readonly includeAudit?: boolean;
  readonly runIds?: readonly ConstellationRunId[];
  readonly activeOnly?: boolean;
}

export interface ConstellationRunStreamCursor {
  readonly after?: ConstellationRunId;
  readonly pageSize?: number;
  readonly includeAudit?: boolean;
}

export interface ConstellationRunDigest {
  readonly mode: ConstellationMode;
  readonly total: number;
  readonly latestRun: string | undefined;
}

export type ReplayCursor<T> = {
  readonly index: number;
  readonly pageSize: number;
  readonly data: readonly T[];
};

export type MutableCursorState<T extends readonly unknown[]> = {
  readonly index: number;
  readonly pageSize: number;
  readonly values: readonly T[];
};

type TailRec<TRows extends readonly ConstellationRunSnapshot[]> = TRows extends readonly [infer THead, ...infer TRest]
  ? THead extends ConstellationRunSnapshot
    ? readonly [THead, ...TailRec<TRest extends readonly ConstellationRunSnapshot[] ? TRest : []>]
    : readonly []
  : readonly [];

export type OrderedRows<TRows extends readonly ConstellationRunSnapshot[]> = TailRec<TRows>;

export const normalizeStoreQuery = (query: NoInfer<ConstellationRunQuery> = {}): ConstellationRunQuery => ({
  runIds: query.runIds?.toSorted((left, right) => left.localeCompare(right)),
  planId: query.planId,
  mode: query.mode,
  includeAudit: query.includeAudit ?? false,
  activeOnly: query.activeOnly ?? false,
});
