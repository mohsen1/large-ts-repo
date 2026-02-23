import { withBrand } from '@shared/core';
import type {
  ContinuityReadinessEnvelope,
  ContinuityReadinessSurface,
  ContinuityReadinessRun,
  ContinuityReadinessTenantId,
  ContinuityReadinessSurfaceId,
  ContinuityReadinessPlanId,
  ContinuityReadinessRunId,
  ContinuityReadinessPageArgs,
  ContinuityReadinessEnvelope as TypeEnvelope,
} from '@domain/recovery-continuity-readiness';
import type { Result } from '@shared/result';

export type ReadinessRecordId = ReturnType<typeof withBrand<string, 'ReadinessRecordId'>>;
export type ReadinessWindowId = ReturnType<typeof withBrand<string, 'ReadinessWindowId'>>;

export interface ReadinessRecordEnvelope {
  readonly id: ReadinessRecordId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly surface: ContinuityReadinessSurface;
  readonly createdAt: string;
  readonly window: {
    from: string;
    to: string;
  };
  readonly createdBy: string;
}

export interface ReadinessRunRecord {
  readonly id: ReadinessRecordId;
  readonly run: ContinuityReadinessRun;
  readonly snapshot: ContinuityReadinessEnvelope;
  readonly archived: boolean;
}

export interface ReadinessMetrics {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly activeRuns: number;
  readonly archivedRuns: number;
  readonly avgRisk: number;
  readonly lastUpdated: string;
}

export interface ReadinessQuery {
  readonly tenantId?: ContinuityReadinessTenantId;
  readonly surfaceId?: ContinuityReadinessSurfaceId;
  readonly planId?: ContinuityReadinessPlanId;
  readonly runId?: ContinuityReadinessRunId;
  readonly activeOnly?: boolean;
  readonly limit?: number;
}

export interface ReadinessSearchResult<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ReadinessStoreDependencies {
  readonly clock?: () => string;
  readonly nowMs?: () => number;
}

export interface ReadinessWindow {
  readonly id: ReadinessWindowId;
  readonly tenantId: ContinuityReadinessTenantId;
  readonly from: string;
  readonly to: string;
}

export interface ReadinessSeed {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly surfaces: ContinuityReadinessSurface[];
}

export const readinessRecordId = (value: string): ReadinessRecordId => withBrand(value, 'ReadinessRecordId');
export const readinessWindowId = (value: string): ReadinessWindowId => withBrand(value, 'ReadinessWindowId');

export type ReadinessEnvelopeResult = Result<ContinuityReadinessEnvelope, Error>;
export type ReadinessListResult = Result<ReadinessSearchResult<TypeEnvelope>, Error>;
export type ReadinessQueryBase = ContinuityReadinessPageArgs;
