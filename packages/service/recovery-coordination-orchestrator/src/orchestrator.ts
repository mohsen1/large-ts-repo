import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { RecoveryRunId, RecoveryRunState, RecoveryProgram } from '@domain/recovery-orchestration';
import type { RiskDimension } from '@domain/recovery-risk-models';
import { createCoordinationProgram, createCandidate } from './helpers';
import type {
  CoordinationAttemptInput,
  CoordinationAttemptReport,
  CoordinationCommandContext,
  CoordinationCommandState,
} from './types';
import {
  asBudget,
  asCorrelation,
  constraintSummary,
  criticalConstraints,
  summarizeTopology,
  topologicalOrder,
  defaultScorer,
  CoordinationBudget,
  type CoordinationConstraint,
  type CoordinationProgram,
  type CoordinationPlanCandidate,
  type CoordinationSelectionResult,
  type CoordinationStep,
  type CoordinationWindow,
} from '@domain/recovery-coordination';
import type { CoordinationRecord } from '@data/recovery-coordination-store';
import {
  createDefaultStore,
  type RecoveryCoordinationStore,
  type RecoveryCoordinationQuery,
} from '@data/recovery-coordination-store';
import { RecoveryPolicyEngine, type PolicyEngineDecision } from '@service/recovery-policy-engine';
import { RecoveryRiskEngine, type RiskEngineDecision } from '@service/recovery-risk-engine';
import { RecoveryPlanOrchestrator, type RecoveryPlanOrchestrationResult } from '@service/recovery-plan-orchestrator';
import { InMemoryCoordinationDelivery } from '@infrastructure/recovery-coordination-notifier';
import type {
  CoordinationDeliveryChannel,
  CoordinationDeliveryEvent,
} from '@infrastructure/recovery-coordination-notifier';

export interface RecoveryCoordinationOrchestratorOptions {
  readonly policyEngine?: RecoveryPolicyEngine;
  readonly riskEngine?: RecoveryRiskEngine;
  readonly planOrchestrator?: RecoveryPlanOrchestrator;
  readonly store?: RecoveryCoordinationStore;
  readonly delivery?: CoordinationDeliveryChannel;
}

export class RecoveryCoordinationOrchestrator {
  private readonly policyEngine: RecoveryPolicyEngine;
  private readonly riskEngine: RecoveryRiskEngine;
  private readonly planOrchestrator: RecoveryPlanOrchestrator;
  private readonly store: RecoveryCoordinationStore;
  private readonly delivery: CoordinationDeliveryChannel;

  constructor(private readonly options: RecoveryCoordinationOrchestratorOptions = {}) {
    this.policyEngine = options.policyEngine ?? new RecoveryPolicyEngine({} as never);
    this.riskEngine = options.riskEngine ?? new RecoveryRiskEngine({} as never);
    this.planOrchestrator = options.planOrchestrator ?? new RecoveryPlanOrchestrator(
      this.policyEngine,
      this.riskEngine,
    );
    this.store = options.store ?? createDefaultStore();
    this.delivery = options.delivery ?? new InMemoryCoordinationDelivery();
  }

  async coordinate(input: CoordinationAttemptInput): Promise<Result<CoordinationAttemptReport, Error>> {
    const correlationId = asCorrelation(input.context.correlationId);
    const budget = asBudget({
      maxStepCount: input.budget?.maxStepCount ?? 50,
      maxParallelism: input.budget?.maxParallelism ?? 4,
      maxRuntimeMinutes: input.budget?.maxRuntimeMinutes ?? 240,
      maxCriticality: 80,
    });

    const program = createCoordinationProgram(input.program, input.context);
    const topology = summarizeTopology(program.steps);
    if (topology.criticalPath.length === 0 && program.steps.length > 0) {
      return fail(new Error('coordination-cycle-detected'));
    }

    const constraintStats = constraintSummary(program.constraints);
    const blockedConstraints = criticalConstraints(program.constraints);
    if (!constraintStats.total) {
      // no constraints is valid; default policy keeps running
    }
    if (budget.maxParallelism < 1 || budget.maxRuntimeMinutes < 1) {
      return fail(new Error('coordination-invalid-budget'));
    }

    const state: CoordinationCommandState = {
      runId: `${input.runId}` as RecoveryRunId,
      state: 'draft',
      phase: 'discovery',
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      progressPercent: 5,
    };
    if (blockedConstraints.length > 0) {
      const aborted: CoordinationCommandState = {
        ...state,
        phase: 'abort',
        progressPercent: 100,
        lastUpdatedAt: new Date().toISOString(),
      };
      return this.recordAndPublish(input, program, aborted, blockedConstraints, budget).then(async (result) => {
        if (!result.ok) return fail(result.error);
        return fail(new Error('coordination-blocked-by-constraints'));
      });
    }

    const policies = await this.policyEngine.assessProgram(input.program, input.runState);
    const risks = await this.riskEngine.evaluate({
      runId: input.runId as never,
      tenant: input.tenant as never,
      policies: [],
      signals: [],
      program: input.program,
      runState: input.runState,
    });
    if (!policies.ok) {
      return fail(policies.error);
    }
    if (!risks.ok) {
      return fail(risks.error);
    }

    const candidates = this.buildCandidates(
      program,
      input.runState,
      topology,
      budget,
      input.context,
      policyToSignals(policies.value),
      riskToSignals(risks.value, blockedConstraints),
    );

    const selected = this.selectCandidate(candidates, program.constraints);
    const selection = this.toSelectionResult(selected, policies.value, risks.value);

    const finalState: CoordinationCommandState = {
      ...state,
      phase: 'delivery',
      progressPercent: 90,
      lastUpdatedAt: new Date().toISOString(),
    };

    const saveResult = await this.recordAndPublish(input, program, finalState, blockedConstraints, budget, selected, selection);
    if (!saveResult.ok) return fail(saveResult.error);

    const notification = this.formatNotification(program, selected, input.context, {
      tenant: input.tenant as never,
      runId: input.runId as never,
      title: 'Recovery coordination plan selected',
      body: `Selected candidate ${selected.id} for program ${program.id}`,
      candidate: {
        id: selected.id,
        metadata: selected.metadata,
      },
      generatedAt: new Date().toISOString(),
    });
    const delivery = await this.delivery.publish(notification);
    if (!delivery.ok) return fail(new Error('coordination-notification-failed'));

    const successReport: CoordinationAttemptReport = {
      runId: `${input.runId}` as RecoveryRunId,
      correlationId: input.context.correlationId,
      tenant: input.tenant,
      accepted: true,
      plan: selected,
      selection,
      state: {
        ...finalState,
        phase: 'complete',
        progressPercent: 100,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    return ok(successReport);
  }

  async recent(runId: RecoveryRunId): Promise<readonly CoordinationAttemptReport[]> {
    const query: RecoveryCoordinationQuery = { runId };
    const records = await this.store.query(query);
    return records.map((record: CoordinationRecord) => ({
      runId: record.runId as RecoveryRunId,
      correlationId: record.selection.selectedCandidate.id,
      tenant: `${record.tenant}`,
      accepted: record.selection.decision === 'approved',
      plan: record.selection.selectedCandidate,
      selection: record.selection,
      state: this.makeState(runId, record.selection.decision),
    }));
  }

  private buildCandidates(
    program: CoordinationProgram,
    runState: RecoveryRunState,
    topology: ReturnType<typeof summarizeTopology>,
    budget: CoordinationBudget,
    context: CoordinationCommandContext,
    policySignals: readonly string[],
    riskSignals: readonly string[],
  ): readonly CoordinationPlanCandidate[] {
    const sequence = topologicalOrder(program.steps);
    const defaultCandidate = createCandidate({
      programId: program.id,
      runId: `${runState.runId}` as never,
      tenant: program.tenant,
      correlationId: asCorrelation(context.correlationId),
      candidateId: `${context.correlationId}:default`,
      sequence,
      budget,
      createdBy: context.requestedBy,
      riskSignals,
      policySignals,
      steps: program.steps,
    });

    const reverseSequence = [...sequence].reverse();
    const fallbackCandidate = createCandidate({
      programId: program.id,
      runId: `${runState.runId}` as never,
      tenant: program.tenant,
      correlationId: asCorrelation(context.correlationId),
      candidateId: `${context.correlationId}:reverse`,
      sequence: reverseSequence,
      budget,
      createdBy: context.requestedBy,
      riskSignals,
      policySignals,
      steps: program.steps,
    });

    const parallelism = Math.max(1, budget.maxParallelism);
    return [defaultCandidate, fallbackCandidate].map((candidate, index) => ({
      ...candidate,
      metadata: {
        ...candidate.metadata,
        parallelism: topology.layers.length > 0 ? Math.min(parallelism, topology.maxDepth) : parallelism,
        expectedCompletionMinutes: index === 0
          ? candidate.metadata.expectedCompletionMinutes
          : candidate.metadata.expectedCompletionMinutes * 1.2,
        riskIndex: defaultScorer(candidate) / 100,
        resilienceScore: topology.maxDepth ? topology.maxDepth / Math.max(topology.totalNodes, 1) : 1,
      },
    }));
  }

  private selectCandidate(
    candidates: readonly CoordinationPlanCandidate[],
    constraints: readonly CoordinationConstraint[],
  ): CoordinationPlanCandidate {
    const penalized = candidates.map((candidate) => {
      const hasHeavyConstraint = candidate.sequence.filter((stepId: CoordinationPlanCandidate['steps'][number]['id']) => {
        const constrained = constraints.some((constraint) =>
          constraint.affectedStepIds.includes(stepId) && constraint.weight > 0.6,
        );
        return constrained;
      }).length;
      const penalty = hasHeavyConstraint * 30;
      const score = defaultScorer(candidate) - penalty;
      return { candidate, score };
    });
    penalized.sort((left, right) => right.score - left.score);
    return penalized[0]?.candidate ?? candidates[0];
  }

  private toSelectionResult(
    selected: CoordinationPlanCandidate,
    policyDecision: PolicyEngineDecision,
    riskDecision: RiskEngineDecision,
  ): CoordinationSelectionResult {
    const policyReasons = [
      ...policyDecision.compliance.decision.blocking,
      ...policyDecision.compliance.decision.mitigations,
    ].map((decision) => `${decision.policyId}:${decision.reason}`);
    const candidates = [selected, {
      ...selected,
      id: `${selected.id}:alternate`,
      createdAt: new Date().toISOString(),
    }];
    return {
      runId: selected.runId as RecoveryRunId,
      selectedCandidate: selected,
      alternatives: candidates,
      decision: (policyDecision.compliance.blocked
        ? 'blocked'
        : riskDecision.shouldDefer ? 'deferred' : 'approved') as CoordinationSelectionResult['decision'],
      blockedConstraints: policyDecision.compliance.requiredEscalations,
      reasons: [...policyReasons, ...riskDecision.recommendations],
      selectedAt: new Date().toISOString(),
    };
  }

  private async recordAndPublish(
    input: CoordinationAttemptInput,
    program: CoordinationProgram,
    state: CoordinationCommandState,
    blockedConstraints: readonly string[],
    budget: CoordinationBudget,
    selected?: CoordinationPlanCandidate,
    selection?: CoordinationSelectionResult,
  ): Promise<Result<boolean, Error>> {
    if (!selected || !selection) {
      const candidate = createCandidate({
        programId: program.id,
        runId: `${input.runId}` as never,
        tenant: program.tenant,
        correlationId: asCorrelation(input.context.correlationId),
        candidateId: `${input.context.correlationId}:pending`,
        sequence: [],
        budget,
        createdBy: input.context.requestedBy,
        riskSignals: [],
        policySignals: [],
        steps: program.steps,
      });
      const stubSelection = {
        runId: `${input.runId}` as never,
        selectedCandidate: candidate,
        alternatives: [candidate],
        decision: blockedConstraints.length ? 'blocked' as CoordinationSelectionResult['decision'] : 'deferred',
        blockedConstraints,
        reasons: blockedConstraints,
        selectedAt: new Date().toISOString(),
      };
      await this.store.save({
        recordId: `${input.context.correlationId}:record`,
        tenant: program.tenant,
        runId: `${input.runId}` as never,
        program,
        selection: stubSelection,
        window: program.runWindow,
        candidate,
        archived: false,
        createdAt: new Date().toISOString(),
        tags: [state.state],
      });
      return ok(true);
    }

    const artifact = {
      recordId: `${input.context.correlationId}:record`,
      tenant: program.tenant,
      runId: `${input.runId}` as never,
      program,
      selection,
      window: program.runWindow,
      candidate: selected,
      archived: false,
      createdAt: new Date().toISOString(),
      tags: [state.phase],
    };
    await this.store.save(artifact);
    return ok(true);
  }

  private formatNotification(
    program: CoordinationProgram,
    candidate: CoordinationPlanCandidate,
    context: CoordinationCommandContext,
    event: CoordinationDeliveryEvent,
  ): CoordinationDeliveryEvent {
    return {
      ...event,
      body: [
        event.body,
        `candidate=${candidate.id}`,
        `steps=${candidate.steps.length}`,
        `scope=${program.scope}`,
      ].join(' | '),
      title: `${event.title} (${program.id})`,
      generatedAt: new Date().toISOString(),
      tenant: program.tenant,
      runId: candidate.runId as never,
      candidate: event.candidate,
    };
  }

  private makeState(runId: RecoveryRunId, decision: CoordinationSelectionResult['decision']): CoordinationCommandState {
    return {
      runId,
      state: decision === 'approved' ? 'completed' : 'staging',
      phase: decision === 'approved' ? 'complete' : 'selection',
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      progressPercent: decision === 'approved' ? 100 : 40,
    };
  }
}

export class PlanSelectionAdapter {
  private readonly orchestration: RecoveryPlanOrchestrator;
  constructor(readonly planOrchestrator: RecoveryPlanOrchestrator) {
    this.orchestration = planOrchestrator;
  }

  async plan(input: CoordinationAttemptInput): Promise<Result<RecoveryPlanOrchestrationResult, Error>> {
    return this.orchestration.createPlan({
      program: input.program,
      runState: input.runState,
      requestedBy: input.context.requestedBy,
      correlationId: input.context.correlationId,
      candidateBudget: 3,
    });
  }
}

const runStateToProgram = (
  program: CoordinationProgram,
  runState: RecoveryRunState,
  sequence: readonly string[],
) => {
  return {
    ...program.rawProgram,
    steps: program.rawProgram.steps.map((step) => ({
      ...step,
      ...program.steps.find((coordinationStep) => coordinationStep.id === step.id),
    })),
    id: `${program.id}-${runState.runId}`,
  };
};

const policyToSignals = (decision: PolicyEngineDecision): readonly string[] => {
  return [
    ...decision.compliance.requiredEscalations,
    ...decision.compliance.decision.blocking.map((violation) => `policy:${violation.policyId}:${violation.reason}`),
  ];
};

const riskToSignals = (
  decision: RiskEngineDecision,
  blocked: readonly string[],
): readonly string[] => {
  return [
    ...decision.recommendations,
    ...blocked.map((block) => `constraint:${block}`),
  ];
};

const createWindow = (): CoordinationWindow => ({
  from: new Date().toISOString(),
  to: new Date(Date.now() + 86_400_000).toISOString(),
  timezone: 'UTC',
});
