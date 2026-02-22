import { fail, ok } from '@shared/result';

import type { Result } from '@shared/result';
import type { RecoveryCheckpoint, RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import type {
  PolicyComplianceBundle,
  PolicyDecision,
  PolicyEvaluationContext,
  RecoveryPolicy,
  RecoveryPolicyEvaluation,
} from '@domain/recovery-policy';
import {
  aggregateDecisions,
  buildEvaluationContext,
  normalizePolicyDecision,
  policyIsBlocking,
  pickTopEscalationRoutes,
} from '@domain/recovery-policy';
import type {
  PolicyReadService,
  RecoveryPolicyRepository,
} from '@data/recovery-policy-store';

export interface PolicyEngineDecision {
  compliance: PolicyComplianceBundle;
  runId: RecoveryRunState['runId'];
}

export class RecoveryPolicyEngine {
  private readonly readService: PolicyReadService;

  constructor(repository: RecoveryPolicyRepository) {
    this.readService = new PolicyReadService(repository);
  }

  async assessProgram(program: RecoveryProgram, run: RecoveryRunState, checkpoint?: RecoveryCheckpoint): Promise<Result<PolicyEngineDecision, Error>> {
    const context = this.buildContext(program, run, checkpoint);
    const snapshot = await this.readService.snapshotForTenant(program.tenant);

    if (snapshot.length === 0) {
      const baseline = this.emptyCompliance(run.runId, 0);
      return ok({ runId: run.runId, compliance: baseline });
    }

    const decisions = [] as PolicyDecision[];

    for (const { policy } of snapshot) {
      if (!this.policyMatchesScope(policy, context)) {
        continue;
      }

      if (!policy.enabled) continue;

      const decision = normalizePolicyDecision(policy, context);
      decisions.push(decision);
    }

    const evaluation = aggregateDecisions(snapshot.length, decisions);
    const bundle: PolicyComplianceBundle = {
      decision: evaluation,
      blocked: decisions.some((decision) => policyIsBlocking([decision])),
      requiredEscalations: pickTopEscalationRoutes(decisions),
      throttleMs: this.calculateThrottleMs(decisions),
    };

    return ok({ runId: run.runId, compliance: bundle });
  }

  private buildContext(program: RecoveryProgram, run: RecoveryRunState, checkpoint?: RecoveryCheckpoint): PolicyEvaluationContext {
    return buildEvaluationContext(program, run, checkpoint);
  }

  private policyMatchesScope(policy: RecoveryPolicy, context: PolicyEvaluationContext): boolean {
    const tenant = policy.scope.tenant;
    if (tenant && tenant !== context.program.tenant) return false;

    const programMatch = policy.scope.programs?.length
      ? policy.scope.programs.includes(context.program.id)
      : true;

    const services = policy.scope.services?.length
      ? policy.scope.services.includes(context.program.service)
      : true;

    const statuses = policy.scope.priorities?.length
      ? policy.scope.priorities.includes(context.run.status)
      : true;

    return programMatch && services && statuses;
  }

  private calculateThrottleMs(decisions: readonly PolicyDecision[]): number {
    const pauses = decisions
      .flatMap((entry) => entry.effects)
      .filter((effect) => effect.action === 'throttle');

    if (pauses.length === 0) return 0;

    return pauses.reduce((total, effect) => {
      return total + (effect.pauseMs ?? 0);
    }, 0);
  }

  private emptyCompliance(runId: RecoveryRunState['runId'], policyCount: number): PolicyComplianceBundle {
    const now = new Date().toISOString();
    return {
      decision: {
        runId,
        policyCount,
        blocking: [],
        advisory: [],
        mitigations: [],
        totalScore: 0,
      },
      blocked: false,
      requiredEscalations: [],
      throttleMs: 0,
    } as PolicyComplianceBundle & { decision: RecoveryPolicyEvaluation };
  }
}
