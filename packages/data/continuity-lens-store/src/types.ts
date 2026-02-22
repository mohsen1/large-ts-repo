import type { Result } from '@shared/result';
import type {
  ContinuityPolicy,
  ContinuityPolicyResult,
  ContinuitySnapshot,
  ContinuitySignal,
  ContinuitySignalId,
  ContinuityTenantId,
  ContinuityWindow,
} from '@domain/continuity-lens';

export type {
  ContinuityPolicyResult,
  ContinuitySnapshot,
  ContinuitySignal,
  ContinuityTenantId,
  ContinuitySignalId,
  ContinuityPolicy,
  ContinuityWindow,
} from '@domain/continuity-lens';

export interface ContinuityLensStoreFilters {
  readonly tenantId: ContinuityTenantId;
  readonly from?: string;
  readonly to?: string;
  readonly includeResolved?: boolean;
  readonly limit?: number;
}

export interface ContinuityStoreSnapshot {
  readonly tenantId: ContinuityTenantId;
  readonly window?: ContinuityWindow;
  readonly signalCount: number;
  readonly snapshotCount: number;
}

export interface ContinuitySignalEnvelope {
  readonly signal: ContinuitySignal;
  readonly tenantId: ContinuityTenantId;
}

export interface ContinuityPolicyEnvelope {
  readonly policy: ContinuityPolicy;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContinuityLensRepository {
  addSignal(signal: ContinuitySignal): Promise<Result<ContinuitySignal, Error>>;
  addSignals(signals: readonly ContinuitySignal[]): Promise<Result<readonly ContinuitySignal[], Error>>;
  addSnapshot(snapshot: ContinuitySnapshot): Promise<Result<ContinuitySnapshot, Error>>;
  addPolicy(policy: ContinuityPolicy): Promise<Result<ContinuityPolicy, Error>>;
  updatePolicy(policy: ContinuityPolicy): Promise<Result<ContinuityPolicy, Error>>;
  getSignal(signalId: ContinuitySignalId): Promise<Result<ContinuitySignal | undefined, Error>>;
  listSignals(filters: ContinuityLensStoreFilters): Promise<Result<readonly ContinuitySignal[], Error>>;
  listSnapshots(filters: ContinuityLensStoreFilters): Promise<Result<readonly ContinuitySnapshot[], Error>>;
  listPolicies(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPolicyResult[], Error>>;
  getStoreSnapshot(tenantId: ContinuityTenantId): Promise<Result<ContinuityStoreSnapshot, Error>>;
  appendPolicyAudit(entry: ContinuityPolicyEnvelope): void;
  getPolicyAudits(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPolicyEnvelope[], Error>>;
}
