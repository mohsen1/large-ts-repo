import type { ReadinessPolicy, ReadinessTarget, ReadinessRunId } from '@domain/recovery-readiness';
import { validatePlanTargets, validateRiskBand } from '@domain/recovery-readiness';
import { foldSignals, targetCriticalityScoreFallback } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';

export interface ReadinessPolicySnapshot {
  policyId: ReadinessPolicy['policyId'];
  policyName: string;
  active: boolean;
  reason: string;
}

export interface ReadinessRunHealth {
  runId: ReadinessRunId;
  score: number;
  signalCount: number;
  directiveCount: number;
  criticality: number;
}

const defaultPolicyConstraints = {
  key: 'default-readiness-policy',
  minWindowMinutes: 15,
  maxWindowMinutes: 420,
  minTargetCoveragePct: 0.72,
  forbidParallelity: true,
};

export const createReadinessPolicy = (tenantId: string): ReadinessPolicy => ({
  policyId: `policy:${tenantId}`,
  name: `${tenantId}-policy`,
  constraints: defaultPolicyConstraints,
  allowedRegions: new Set(['us-east-1', 'us-west-2', 'eu-west-1', 'global']),
  blockedSignalSources: ['manual-check'],
});

export class ReadinessWorkbench {
  private readonly policy: ReadinessPolicy;
  private readonly snapshots = new Map<ReadinessRunId, ReadinessReadModel>();

  constructor(policy?: ReadinessPolicy) {
    this.policy = policy ?? createReadinessPolicy('default');
  }

  inspectPlan(plan: { targets: ReadinessTarget[]; signals: { severity: string }[] }): ReadinessPolicySnapshot {
    const validation = validatePlanTargets(this.policy, {
      targets: plan.targets,
    } as never);
    const risk = validateRiskBand(this.policy, plan.signals as never);

    const active = validation.valid && risk.valid;
    const reason = active
      ? 'policy-compliant'
      : [...validation.failures, ...risk.failures].map((entry) => `${entry.rule}:${entry.message}`).join(';');

    return {
      policyId: this.policy.policyId,
      policyName: this.policy.name,
      active,
      reason,
    };
  }

  score(model: ReadinessReadModel): ReadinessRunHealth {
    this.snapshots.set(model.plan.runId, model);
    const summary = foldSignals(model.signals);
    const criticality = model.targets.reduce((acc, target) => acc + targetCriticalityScoreFallback(target), 0);
    return {
      runId: model.plan.runId,
      score: summary.weightedScore,
      signalCount: model.signals.length,
      directiveCount: model.directives.length,
      criticality,
    };
  }

  listRunIds(): ReadinessRunId[] {
    return Array.from(this.snapshots.keys());
  }

  get status() {
    const snapshots = this.snapshots.size;
    return {
      policy: this.policy.policyId,
      snapshots,
      state: snapshots === 0 ? 'ready' : 'draining',
      allowedRegions: Array.from(this.policy.allowedRegions),
    };
  }
}
