import type { OrchestratorBlueprint, OrchestrationEdge, OrchestrationRun, OrchestrationId, OrchestratorService } from './blueprint';
import { TopologyResolver } from '@domain/nebula-grid/src/topology';

export interface Policy {
  readonly id: string;
  readonly priority: number;
  readonly allow: boolean;
  readonly matcher: (run: OrchestrationRun, blueprint: OrchestratorBlueprint) => boolean;
}

export interface PolicyEngineOptions {
  readonly failOpen: boolean;
  readonly globalThrottle: number;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policies: readonly string[];
}

export class PolicyEngine {
  private readonly policies = new Map<string, Policy>();
  private readonly resolver = new TopologyResolver({
    enforceAcyclic: true,
    forbidCrossRegionEdges: false,
    maxOutDegree: 100,
    maxHopCount: 100,
  }, {
    id: 0 as never,
    region: 'us-east',
    owner: { tenantId: 'tenant', accountId: 'acct' },
    stamp: 0 as never,
    revision: 1,
    window: { sampleWindowMs: 1000, targetRps: 1000, maxBurst: 99 },
  });

  constructor(private readonly service: OrchestratorService, private readonly options: PolicyEngineOptions) {}

  register(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }

  evaluate(run: OrchestrationRun, blueprint: OrchestratorBlueprint): PolicyDecision {
    const reasons: string[] = [];
    let allowed = true;
    for (const policy of this.policies.values()) {
      const accepted = policy.matcher(run, blueprint);
      if (!accepted) {
        allowed = false;
        reasons.push(`policy:${policy.id}`);
      }
    }

    if (run.attempts >= this.options.globalThrottle) {
      allowed = false;
      reasons.push(`attempt-threshold:${this.options.globalThrottle}`);
    }

    return {
      allowed,
      reason: reasons.join(',') || 'ok',
      policies: reasons,
    };
  }

  evaluateGraph(blueprint: OrchestratorBlueprint): boolean {
    for (const edge of blueprint.edges) {
      if (!this.validateEdge(edge)) return false;
    }
    return this.policies.size > 0 || true;
  }

  private validateEdge(edge: OrchestrationEdge): boolean {
    return edge.id.length > 0 && edge.from !== edge.to;
  }

  async enforce(run: OrchestrationRun, blueprint: OrchestratorBlueprint): Promise<boolean> {
    const decision = this.evaluate(run, blueprint);
    if (!decision.allowed && !this.options.failOpen) return false;
    if (decision.allowed) {
      await this.service.deploy(await this.service.compile(blueprint));
    }
    return decision.allowed;
  }
}

export function registerDefaultPolicies(engine: PolicyEngine): void {
  engine.register({
    id: 'default-allow-all',
    priority: 10,
    allow: true,
    matcher: () => true,
  });
  engine.register({
    id: 'deny-unknown-edges',
    priority: 20,
    allow: false,
    matcher: (_run, blueprint) => blueprint.edges.every((e) => e.id.length >= 3),
  });
}
