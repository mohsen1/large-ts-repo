import { fail, ok, type Result } from '@shared/result';
import { parseDecisionPolicy } from '@data/decision-catalog';
import { createPolicyMeta, type MeshErrorContext, type PolicyBundle, type PolicyMeta } from './types';

export interface RegistrySnapshot {
  totalActive: number;
  totalInactive: number;
  tenants: Record<string, number>;
}

export interface PolicyRegistry {
  upsert(raw: unknown): Promise<Result<PolicyBundle, MeshErrorContext>>;
  remove(policyId: string): void;
  get(policyId: string): PolicyBundle | undefined;
  findByTenant(tenantId: string): PolicyBundle[];
  all(): PolicyBundle[];
  snapshot(): RegistrySnapshot;
}

class MemoryPolicyRegistry implements PolicyRegistry {
  private readonly policies = new Map<string, PolicyBundle>();

  async upsert(raw: unknown): Promise<Result<PolicyBundle, MeshErrorContext>> {
    const parsed = parseDecisionPolicy(raw);
    if (!parsed.ok) {
      return fail({
        requestId: `mesh-${Date.now()}-policy` as never,
        at: new Date().toISOString(),
        message: parsed.error,
      });
    }

    const template = parsed.value;
    const meta: PolicyMeta = {
      ...createPolicyMeta(template, Math.max(1, template.nodes.length + template.edges.length)),
      tenantId: template.tenantId.toLowerCase(),
      active: template.active,
      version: template.version,
    };

    const bundle: PolicyBundle = {
      template,
      meta,
    };

    if (!bundle.meta.active) {
      this.policies.delete(bundle.meta.policyId);
      return ok(bundle);
    }

    this.policies.set(bundle.meta.policyId, bundle);
    return ok(bundle);
  }

  remove(policyId: string): void {
    this.policies.delete(policyId);
  }

  get(policyId: string): PolicyBundle | undefined {
    return this.policies.get(policyId);
  }

  findByTenant(tenantId: string): PolicyBundle[] {
    const normalized = tenantId.toLowerCase();
    return [...this.policies.values()].filter((bundle) => bundle.meta.tenantId === normalized);
  }

  all(): PolicyBundle[] {
    return [...this.policies.values()];
  }

  snapshot(): RegistrySnapshot {
    let totalActive = 0;
    let totalInactive = 0;
    const tenants: Record<string, number> = {};

    for (const bundle of this.policies.values()) {
      if (bundle.meta.active) totalActive += 1;
      else totalInactive += 1;
      tenants[bundle.meta.tenantId] = (tenants[bundle.meta.tenantId] ?? 0) + 1;
    }

    return { totalActive, totalInactive, tenants };
  }
}

export const createMemoryPolicyRegistry = (): PolicyRegistry => new MemoryPolicyRegistry();
