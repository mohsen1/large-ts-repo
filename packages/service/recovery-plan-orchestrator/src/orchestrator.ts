import type { RiskSignal, RiskWindow } from '@domain/recovery-risk-models';
import {
  calculateWindow,
  sliceSignalsByWindow,
  type RiskContext,
} from '@domain/recovery-risk-models';
import {
  buildPlanBlueprint,
  buildRoute,
  composeExecutionSequence,
  rankRouteCandidates,
} from '@domain/recovery-plan';
import type {
  RecoveryExecutionContext,
  RecoveryExecutionPlan,
  RecoveryPlanCandidate,
  RecoveryPlanSignal,
} from '@domain/recovery-plan';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { RecoveryRunState, RecoveryStep, RecoveryProgram } from '@domain/recovery-orchestration';
import { RecoveryPolicyEngine, type PolicyEngineDecision } from '@service/recovery-policy-engine';
import { RecoveryRiskEngine, type RiskEngineDecision, type RunRiskContext } from '@service/recovery-risk-engine';
import { InMemoryRecoveryPlanStore, type RecoveryPlanStoreQuery, encodePlanRecord, type RecoveryPlanStoreRepository, type RecoveryPlanRecord } from '@data/recovery-plan-store';

export interface RecoveryRunOrchestrationInput {
  readonly program: RecoveryProgram;
  readonly runState: RecoveryRunState;
  readonly requestedBy: string;
  readonly correlationId: string;
  readonly candidateBudget?: number;
}

export interface RecoveryPlanOrchestrationResult {
  readonly selectedCandidate: RecoveryPlanCandidate;
  readonly plan: RecoveryExecutionPlan;
  readonly policyDecision: PolicyEngineDecision;
  readonly riskDecision: RiskEngineDecision;
  readonly shouldAbort: boolean;
  readonly shouldDefer: boolean;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly estimatedDurationMinutes: number;
  readonly executionSequence: readonly RecoveryStep[];
}

export class RecoveryPlanOrchestrator {
  private readonly policyEngine: RecoveryPolicyEngine;
  private readonly riskEngine: RecoveryRiskEngine;
  private readonly store: RecoveryPlanStoreRepository;

  constructor(
    policyEngine: RecoveryPolicyEngine,
    riskEngine: RecoveryRiskEngine,
    store: RecoveryPlanStoreRepository = new InMemoryRecoveryPlanStore(),
  ) {
    this.policyEngine = policyEngine;
    this.riskEngine = riskEngine;
    this.store = store;
  }

  async createPlan(input: RecoveryRunOrchestrationInput): Promise<Result<RecoveryPlanOrchestrationResult, Error>> {
    const policyDecision = await this.policyEngine.assessProgram(input.program, input.runState);
    if (!policyDecision.ok) {
      return fail(policyDecision.error);
    }

    const signals = this.createStepSignals(input);
    const riskWindow = calculateWindow(input.runState.runId, 0);
    const riskSignals = sliceSignalsByWindow(signals, {
      from: riskWindow.validFrom,
      to: riskWindow.validTo,
      includeRecoveries: true,
      limit: 200,
    });

    const riskDecision = await this.riskEngine.evaluate(this.makeRiskContext(input, riskSignals, riskWindow));
    if (!riskDecision.ok) {
      return fail(riskDecision.error);
    }

    const orderedSteps = composeExecutionSequence(input.program, 'least-risk');
    const executionSequence = orderedSteps.map((step) => step.id);
    const routes = [
      buildRoute(
        `route:${input.runState.runId}:default`,
        executionSequence,
        'least-risk route',
        orderedSteps.length * 120,
        this.planSignals(input, 'policy'),
      ),
      buildRoute(
        `route:${input.runState.runId}:reversed`,
        [...executionSequence].reverse(),
        'topology-first fallback',
        orderedSteps.length * 180,
        this.planSignals(input, 'risk'),
      ),
    ];
    const candidates = rankRouteCandidates(routes, this.getRunAgeMinutes(input.runState));
    const selected = candidates[0];
    const plan = buildPlanBlueprint(input.program, input.runState, candidates);

    if (!selected) {
      return fail(new Error('no-plan-candidate-available'));
    }

    const decision: RecoveryPlanOrchestrationResult = {
      selectedCandidate: {
        ...selected,
        blockingPolicyCount: policyDecision.value.compliance.blocked ? 1 : 0,
        policyEvaluations: [policyDecision.value.compliance.decision],
        signals: this.planSignals(input, 'ops'),
      },
      plan: {
        ...plan,
        selected: selected.id,
      },
      policyDecision: policyDecision.value,
      riskDecision: riskDecision.value,
      shouldAbort: policyDecision.value.compliance.blocked || riskDecision.value.shouldAbort,
      shouldDefer: policyDecision.value.compliance.throttleMs > 0 || riskDecision.value.shouldDefer,
      confidence: selected.confidence,
      reasons: [
        ...policyDecision.value.compliance.requiredEscalations,
        ...riskDecision.value.recommendations.slice(0, 2),
      ],
      estimatedDurationMinutes: selected.estimatedMinutes,
      executionSequence: orderedSteps,
    };

    await this.persistPlanRecord({
      id: `${input.runState.runId}:plan`,
      tenant: input.program.tenant,
      runId: input.runState.runId,
      context: this.toContext(input),
      plan: decision.plan,
      candidate: decision.selectedCandidate.id,
      createdAt: new Date().toISOString(),
    });

    return ok(decision);
  }

  async recentPlans(query: RecoveryPlanStoreQuery): Promise<readonly RecoveryPlanRecord[]> {
    return this.store.query(query);
  }

  private async persistPlanRecord(record: RecoveryPlanRecord): Promise<void> {
    await this.store.save(record);
    await this.store.appendEnvelope(encodePlanRecord(record));
  }

  private getRunAgeMinutes(runState: RecoveryRunState): number {
    const start = Date.parse(runState.startedAt ?? new Date().toISOString());
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 60_000));
  }

  private createStepSignals(input: RecoveryRunOrchestrationInput): readonly RiskSignal[] {
    return input.program.steps.map((step, index) => ({
      id: `${input.runState.runId}:${step.id}` as never,
      runId: input.runState.runId,
      source: 'incidentFeed',
      observedAt: new Date().toISOString(),
      metricName: step.command,
      dimension: ['blastRadius', 'dependencyCoupling', 'recoveryLatency', 'dataLoss', 'compliance'][index % 5],
      value: 0.8 + index * 0.1,
      weight: 0.4,
      tags: ['generated', 'orchestration'],
      context: {
        tenant: input.program.tenant,
        command: step.command,
      },
    }));
  }

  private makeRiskContext(
    input: RecoveryRunOrchestrationInput,
    signals: readonly RiskSignal[],
    riskWindow: RiskWindow,
  ): RunRiskContext {
    const context: RiskContext = {
      programId: input.program.id,
      runId: input.runState.runId,
      tenant: input.program.tenant,
      currentStatus: input.runState.status,
      allowedWindow: riskWindow,
    };

    return {
      runId: input.runState.runId,
      program: input.program,
      runState: input.runState,
      tenant: input.program.tenant,
      policies: [],
      signals,
    };
  }

  private planSignals(input: RecoveryRunOrchestrationInput, source: RecoveryPlanSignal['source']): readonly RecoveryPlanSignal[] {
    return input.program.steps.map((step, index) => ({
      id: `${input.runState.runId}:${step.id}` as never,
      source,
      value: step.requiredApprovals + 1 + index,
      note: step.title,
    }));
  }

  private toContext(input: RecoveryRunOrchestrationInput): RecoveryExecutionContext {
    return {
      program: input.program,
      runState: input.runState,
      requestedBy: input.requestedBy,
      correlationId: input.correlationId,
      candidateBudget: input.candidateBudget ?? 3,
    };
  }
}
