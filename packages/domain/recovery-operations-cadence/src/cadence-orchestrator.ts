import { buildCandidateFromRun, envelopeForCadencePlan, planCandidate, validateCadenceRunPlan } from './planner';
import { evaluateCadence, DefaultCadencePolicyEngine } from './policy';
import { buildTopology, estimateWindowCapacity } from './topology';
import { splitWindows } from './utility';
import { summarizeCadenceSignals } from './cadence-signals';
import { CadencePlanRegistry } from './cadence-registry';
import {
  CadencePlanCandidate,
  CadencePolicyConstraint,
  CadenceRunPlan,
  CadenceExecutionContext,
  CadenceWindow,
  CadenceRunId,
  CadenceSlot,
} from './types';
import { type RecoveryRunState, type RecoveryStep } from '@domain/recovery-orchestration';
import {
  type ReadinessSignal,
  type ReadinessSignalEnvelope,
  type ReadinessConstraintSet,
  type ReadinessRunId,
} from '@domain/recovery-readiness';
import { type RecoveryRunId } from '@domain/recovery-orchestration';
import { type RunPlanId, type RunSession } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

const normalizeConstraintToPolicy = (
  constraints: readonly ReadinessConstraintSet[],
): readonly CadencePolicyConstraint[] =>
  constraints.flatMap((constraint, index) => [
    {
      id: `${String(constraint.policyId)}:${index}` as CadencePolicyConstraint['id'],
      key: 'constraints.maxSignalsPerMinute',
      expression: `maxSignalsPerMinute <= ${constraint.maxSignalsPerMinute ?? 0}`,
      enabled: (constraint.maxSignalsPerMinute ?? 0) > 0,
      weight: 0.95,
    },
    {
      id: `${String(constraint.policyId)}:${index + 1}` as CadencePolicyConstraint['id'],
      key: 'constraints.minimumActiveTargets',
      expression: `minimumActiveTargets >= ${constraint.minimumActiveTargets}`,
      enabled: constraint.minimumActiveTargets >= 1,
      weight: 0.75,
    },
  ]);

const cadenceWindowId = (runId: RecoveryRunState['runId'], index: number): CadenceWindow['id'] =>
  `${runId}-window-${index}` as CadenceWindow['id'];

const planIdFrom = (runId: RecoveryRunState['runId'], sessionId: RunSession['id']): RunPlanId =>
  withBrand(`${runId}-${sessionId}`, 'RunPlanId');

const toCadenceWindow = (run: RecoveryRunState, session: RunSession, index: number): CadenceWindow => {
  const start = new Date(Date.now() + index * 2 * 60 * 60_000).toISOString();
  const end = new Date(Date.now() + (index + 2) * 2 * 60 * 60_000).toISOString();
  return {
    id: cadenceWindowId(run.runId, index),
    title: `window-${index}-${session.id}`,
    startsAt: start,
    endsAt: end,
    timezone: 'UTC',
    maxParallelism: Math.max(1, session.constraints.maxRetries - index),
    maxRetries: session.constraints.maxRetries,
    requiredApprovals: session.constraints.operatorApprovalRequired ? 2 : 1,
  };
};

const toCadenceStep = (step: RecoveryStep, run: RecoveryRunState, session: RunSession): CadenceSlot => ({
  id: `${run.runId}-${step.id}` as CadenceSlot['id'],
  windowId: cadenceWindowId(run.runId, 0),
  plannedFor: run.startedAt ?? new Date().toISOString(),
  planId: planIdFrom(run.runId, session.id),
  stepId: step.id,
  command: step.command,
  weight: Math.min(1, Math.max(0.1, (step.tags.length || 1) / 4)),
  tags: [...step.tags, run.programId],
  requires: [],
  estimatedMinutes: Math.max(10, step.timeoutMs / 60_000),
});

const toReadinessId = (runId: RecoveryRunState['runId']): ReadinessRunId =>
  withBrand(String(runId), 'ReadinessRunId');

const toCadenceId = (runId: RecoveryRunState['runId']): CadenceRunId => withBrand(String(runId), 'CadenceRunId');

export type OrchestrationMode = 'dry-run' | 'advisory' | 'execute';

export type OrchestratorAction =
  | { readonly kind: 'candidate-built'; readonly candidate: CadencePlanCandidate }
  | { readonly kind: 'plan-computed'; readonly plan: CadenceRunPlan }
  | { readonly kind: 'validation-failed'; readonly reasons: readonly string[] };

export class CadenceOrchestrator {
  private readonly events: OrchestratorAction[] = [];

  constructor(
    private readonly registry: CadencePlanRegistry,
    private readonly defaultPolicy = new DefaultCadencePolicyEngine(),
  ) {}

  get auditLog(): readonly OrchestratorAction[] {
    return [...this.events];
  }

  clearLog(): void {
    this.events.length = 0;
  }

  buildCandidateFromRun(
    run: RecoveryRunState,
    session: RunSession,
    steps: readonly RecoveryStep[],
    signals: ReadonlyArray<ReadinessSignal>,
    constraints: readonly ReadinessConstraintSet[],
  ): CadencePlanCandidate {
    const windows = [toCadenceWindow(run, session, 0), toCadenceWindow(run, session, 1)];
    const slots = steps.map((step) => toCadenceStep(step, run, session));
    const baseCandidate = buildCandidateFromRun(
      run,
      session,
      windows,
      slots,
      run.status === 'running' ? 'automation' : 'planner',
    );
    const summary = summarizeCadenceSignals({
      runId: toReadinessId(run.runId),
      signals,
      constraints,
    });

    const candidate: CadencePlanCandidate = {
      ...baseCandidate,
      constraints: [
        ...normalizeConstraintToPolicy(constraints),
        ...summary.denseSignals.map((signal) => ({
          id: `${String(signal.signalId)}-density` as CadencePolicyConstraint['id'],
          key: 'signal-density',
          expression: `${String(signal.targetId)}-density`,
          enabled: true,
          weight: 0.25,
        })),
      ],
      notes: [...baseCandidate.notes, ...Array.from(summary.sourceMap.keys())],
      revision: summary.uniqueTargets * 11 + windows.length,
    };

    const candidateEnvelope = this.registry.registerCandidate(candidate, toCadenceId(run.runId));
    const evaluation = this.defaultPolicy.evaluate(candidate);

    this.events.push({ kind: 'candidate-built', candidate });

    if (!evaluation.ok) {
      this.events.push({
        kind: 'validation-failed',
        reasons: [...evaluation.reasons, ...candidateEnvelope.audit.reasonTrail],
      });
    }

    return candidate;
  }

  buildPlan(candidate: CadencePlanCandidate, mode: OrchestrationMode, sessionId: CadenceRunId): CadenceRunPlan {
    const plan = planCandidate(candidate, new Date(Date.now()).toISOString());
    const validation = validateCadenceRunPlan(plan);
    if (!validation.ok) {
      this.events.push({ kind: 'validation-failed', reasons: validation.reasons });
      throw new Error(`Cadence plan rejected: ${validation.reasons.join(', ')}`);
    }

    const windows = splitWindows(plan);
    if (windows.length === 0) {
      throw new Error('No execution windows produced from candidate');
    }

    const capacities = windows.map((window) => ({
      id: String(window.window.id),
      capacity: estimateWindowCapacity(window.window),
    }));
    const policy = evaluateCadence(candidate);
    const summary = policy.ok ? `plan-valid-${candidate.profile.source}` : `plan-deferred-${policy.reasons.length}`;
    const envelope = envelopeForCadencePlan(plan);
    const topology = buildTopology(candidate);

    void envelope;
    void mode;
    void sessionId;
    void topology;
    void capacities;

    this.events.push({ kind: 'plan-computed', plan });

    return {
      ...plan,
      readinessScore: Number((policy.score * 0.91).toFixed(3)),
      policySummary: {
        ...plan.policySummary,
        warnings: [...plan.policySummary.warnings, summary],
      },
    };
  }

  executePlan(context: CadenceExecutionContext): CadenceRunPlan {
    const candidate = this.buildCandidateFromRun(
      context.run,
      context.session,
      context.runPlan.slots.map((slot) => ({
        id: String(slot.id),
        title: `slot-${slot.id}`,
        command: slot.command,
        timeoutMs: slot.estimatedMinutes * 60_000,
        dependencies: slot.requires.map((requirement) => String(requirement)),
        requiredApprovals: 1,
        tags: ['execute'],
      })),
      [] as ReadonlyArray<ReadinessSignal>,
      [],
    );

    return this.buildPlan(candidate, 'execute', toCadenceId(context.run.runId));
  }

  fetchLatestPlans(limit = 5): readonly CadenceRunPlan[] {
    return this.registry
      .listRecentPlans(limit)
      .map((entry) => entry.plan)
      .filter((plan) => validateCadenceRunPlan(plan).ok);
  }
}

export const createCadenceOrchestrator = (): CadenceOrchestrator =>
  new CadenceOrchestrator(new CadencePlanRegistry(45), new DefaultCadencePolicyEngine());

export const normalizeReadinessSignals = (signals: ReadonlyArray<ReadinessSignalEnvelope>): ReadinessSignal[] =>
  signals.map((entry) => entry.signal as ReadinessSignal);

export const mapToCadenceRunId = (runId: ReadinessRunId | RecoveryRunId): CadenceRunId =>
  withBrand(`${runId}-cadence`, 'CadenceRunId');
