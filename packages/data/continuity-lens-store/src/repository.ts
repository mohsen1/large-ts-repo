import { ok, fail, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  ContinuityPolicy,
  ContinuitySignal,
  ContinuitySnapshot,
  ContinuityWindow,
  ContinuityTenantId,
  ContinuityPolicyResult,
  ContinuitySignalId,
} from '@domain/continuity-lens';
import type {
  ContinuityLensRepository,
  ContinuityLensStoreFilters,
  ContinuityPolicyEnvelope,
  ContinuityStoreSnapshot,
} from './types';
import { applySignalFilters, applySnapshotFilters } from './query';

interface StoreState {
  signals: Map<string, ContinuitySignal>;
  snapshots: Map<string, ContinuitySnapshot>;
  policies: Map<string, ContinuityPolicy>;
  audits: ContinuityPolicyEnvelope[];
}

const seedWindow = (tenantId: ContinuityTenantId): ContinuityWindow => ({
  id: withBrand(`${tenantId}:bootstrap`, 'ContinuityWindowId'),
  tenantId,
  from: new Date().toISOString(),
  to: new Date().toISOString(),
  horizonMinutes: 30,
  snapshotIds: [],
});

const clampLimit = (value?: number): number => {
  if (!Number.isFinite(value as number)) return 250;
  return Math.max(1, Math.min(1000, Math.floor(value ?? 250)));
};

export class InMemoryContinuityLensStore implements ContinuityLensRepository {
  private readonly state: StoreState = {
    signals: new Map<string, ContinuitySignal>(),
    snapshots: new Map<string, ContinuitySnapshot>(),
    policies: new Map<string, ContinuityPolicy>(),
    audits: [],
  };

  async addSignal(signal: ContinuitySignal): Promise<Result<ContinuitySignal, Error>> {
    this.state.signals.set(signal.id, signal);
    return ok(signal);
  }

  async addSignals(signals: readonly ContinuitySignal[]): Promise<Result<readonly ContinuitySignal[], Error>> {
    try {
      for (const signal of signals) {
        this.state.signals.set(signal.id, signal);
      }
      return ok(signals);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('add-signals-failed'));
    }
  }

  async addSnapshot(snapshot: ContinuitySnapshot): Promise<Result<ContinuitySnapshot, Error>> {
    this.state.snapshots.set(snapshot.id, snapshot);
    return ok(snapshot);
  }

  async addPolicy(policy: ContinuityPolicy): Promise<Result<ContinuityPolicy, Error>> {
    this.state.policies.set(policy.id, policy);
    return ok(policy);
  }

  async updatePolicy(policy: ContinuityPolicy): Promise<Result<ContinuityPolicy, Error>> {
    if (!this.state.policies.has(policy.id)) return fail(new Error('policy-not-found'));
    this.state.policies.set(policy.id, policy);
    return ok(policy);
  }

  async getSignal(signalId: ContinuitySignal['id']): Promise<Result<ContinuitySignal | undefined, Error>> {
    return ok(this.state.signals.get(signalId));
  }

  async listSignals(filters: ContinuityLensStoreFilters): Promise<Result<readonly ContinuitySignal[], Error>> {
    const list = [...applySignalFilters([...this.state.signals.values()], filters)].sort((left, right) =>
      Date.parse(right.reportedAt) - Date.parse(left.reportedAt),
    );
    return ok(list.slice(0, clampLimit(filters.limit)));
  }

  async listSnapshots(filters: ContinuityLensStoreFilters): Promise<Result<readonly ContinuitySnapshot[], Error>> {
    const list = [...applySnapshotFilters([...this.state.snapshots.values()], filters)].sort((left, right) =>
      Date.parse(right.windowEnd) - Date.parse(left.windowStart),
    );
    return ok(list.slice(0, clampLimit(filters.limit)));
  }

  async listPolicies(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPolicyResult[], Error>> {
    const policies = [...this.state.policies.values()].filter((policy) => policy.tenantId === tenantId);
    const policiesWithResults = policies.map<ContinuityPolicyResult>((policy) => {
      const matches = [...this.state.signals.values()].filter((signal) => signal.tenantId === tenantId);
      return {
        policy,
        matches: matches.length,
        violations: [],
        approved: policy.allowAutoMitigation,
      };
    });
    return ok(policiesWithResults);
  }

  async getStoreSnapshot(tenantId: ContinuityTenantId): Promise<Result<ContinuityStoreSnapshot, Error>> {
    const signalCount = [...this.state.signals.values()].filter((signal) => signal.tenantId === tenantId).length;
    const snapshotCount = [...this.state.snapshots.values()].filter((snapshot) => snapshot.tenantId === tenantId).length;
    return ok({
      tenantId,
      window: seedWindow(tenantId),
      signalCount,
      snapshotCount,
    });
  }

  appendPolicyAudit(record: ContinuityPolicyEnvelope): void {
    this.state.audits.push(record);
  }

  async getPolicyAudits(tenantId: ContinuityTenantId): Promise<Result<readonly ContinuityPolicyEnvelope[], Error>> {
    return ok(this.state.audits.filter((entry) => entry.policy.tenantId === tenantId));
  }
}

export type { ContinuitySignalId };
