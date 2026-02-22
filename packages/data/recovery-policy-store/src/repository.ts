import type { Brand } from '@shared/core';
import type { Ok, Result } from '@shared/result';
import { fail, ok } from '@shared/result';

import type { RecoveryPolicyId } from '@domain/recovery-policy';
import type { RecoveryPolicy } from '@domain/recovery-policy';
import type { PolicyEvaluationContext, PolicyDecision, PolicyComplianceBundle } from '@domain/recovery-policy';

export interface RecoveryPolicySnapshot {
  readonly policy: RecoveryPolicy;
  readonly checksum: string;
}

export interface RecoveryPolicyRepository {
  save(policy: RecoveryPolicy): Promise<boolean>;
  remove(policyId: RecoveryPolicyId): Promise<boolean>;
  get(policyId: RecoveryPolicyId): Promise<RecoveryPolicy | undefined>;
  findByTenant(tenant: Brand<string, 'TenantId'>): Promise<readonly RecoveryPolicy[]>;
  activePolicies(tenant?: Brand<string, 'TenantId'>): Promise<readonly RecoveryPolicy[]>;
}

export interface DecisionLedger {
  append(bundle: PolicyComplianceBundle, key: string): Promise<boolean>;
  latest(runId: string): Promise<PolicyComplianceBundle | undefined>;
}

const buildPolicyChecksum = (policy: RecoveryPolicy): string => {
  return `${policy.id}:${policy.version}:${policy.updatedAt}`;
};

export class InMemoryRecoveryPolicyRepository implements RecoveryPolicyRepository {
  private readonly policies = new Map<RecoveryPolicyId, RecoveryPolicy>();

  async save(policy: RecoveryPolicy): Promise<boolean> {
    this.policies.set(policy.id, policy);
    return true;
  }

  async remove(policyId: RecoveryPolicyId): Promise<boolean> {
    return this.policies.delete(policyId);
  }

  async get(policyId: RecoveryPolicyId): Promise<RecoveryPolicy | undefined> {
    return this.policies.get(policyId);
  }

  async findByTenant(tenant: Brand<string, 'TenantId'>): Promise<readonly RecoveryPolicy[]> {
    return Array.from(this.policies.values()).filter((policy) => policy.scope.tenant === tenant);
  }

  async activePolicies(tenant?: Brand<string, 'TenantId'>): Promise<readonly RecoveryPolicy[]> {
    const policies = Array.from(this.policies.values());
    const active = policies.filter((policy) => policy.enabled);
    if (!tenant) return active;
    return active.filter((policy) => !policy.scope.tenant || policy.scope.tenant === tenant);
  }
}

export class MemoryDecisionLedger implements DecisionLedger {
  private readonly entries = new Map<string, PolicyComplianceBundle>();

  async append(bundle: PolicyComplianceBundle, key: string): Promise<boolean> {
    this.entries.set(key, bundle);
    return true;
  }

  async latest(runId: string): Promise<PolicyComplianceBundle | undefined> {
    return this.entries.get(runId);
  }
}

export class PolicyReadService {
  private readonly snapshots = new Map<string, RecoveryPolicySnapshot[]>();

  constructor(private readonly repository: RecoveryPolicyRepository) {}

  async snapshotForTenant(tenant: string): Promise<ReadonlyArray<RecoveryPolicySnapshot>> {
    const snapshotByTenant = tenant
      ? await this.repository.activePolicies(tenant as Brand<string, 'TenantId'>)
      : await this.repository.activePolicies();

    return snapshotByTenant.map((policy) => ({ policy, checksum: buildPolicyChecksum(policy) }));
  }

  async evaluatePolicySet(
    context: PolicyEvaluationContext,
    evaluate: (policy: RecoveryPolicy, context: PolicyEvaluationContext) => Promise<Result<readonly PolicyDecision[], Error>>
  ): Promise<Result<readonly PolicyDecision[], Error>> {
    const policies = await this.repository.activePolicies(context.program.tenant);
    const decisions: PolicyDecision[] = [];

    for (const policy of policies) {
      if (!policy.enabled) continue;
      const result = await evaluate(policy, context);
      if (result.ok) {
        decisions.push(...result.value);
      } else {
        return fail(new Error(`policy-evaluation-failed:${policy.id}`));
      }
    }

    return ok(decisions);
  }
}
