import type { CadencePlanCandidate, CadenceRunPlan } from './types';
import { CadenceOrchestrator, createCadenceOrchestrator, mapToCadenceRunId } from './cadence-orchestrator';
import { buildCadenceDashboardPayload, mapSignalsToCadence, projectCandidateSignals } from './cadence-adapters';
import { estimateRunCompletionMinutes } from './cadence-metrics';
import type { CadenceSignalEnvelope } from './cadence-adapters';
import {
  type ReadinessConstraintSet,
  type ReadinessPolicyEnvelope,
  type ReadinessPolicyViolation,
  type ReadinessForecast,
  type ReadinessRunbook,
  type ReadinessSignal,
  type ReadinessSignalEnvelope,
  type ReadinessRunId,
} from '@domain/recovery-readiness';
import type { RecoveryRunState, RecoveryStep } from '@domain/recovery-orchestration';
import type { RunSession } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export type CadenceWorkflowArtifact = {
  readonly id: CadenceRunPlan['id'];
  readonly plan: CadenceRunPlan;
  readonly candidate: CadencePlanCandidate;
  readonly signals: readonly CadenceSignalEnvelope[];
  readonly candidateSignalCount: number;
};

export type CadenceServiceSnapshot = {
  readonly createdAt: string;
  readonly runId: string;
  readonly candidates: readonly CadencePlanCandidate[];
  readonly plans: readonly CadenceRunPlan[];
  readonly dashboard: ReturnType<typeof buildCadenceDashboardPayload>;
};

export type OrchestrationInputs = {
  readonly run: RecoveryRunState;
  readonly session: RunSession;
  readonly steps: readonly RecoveryStep[];
  readonly signals: readonly ReadinessSignal[];
  readonly constraints: readonly ReadinessConstraintSet[];
  readonly violations: readonly ReadinessPolicyViolation[];
  readonly policy: ReadinessPolicyEnvelope;
  readonly forecasts: readonly ReadinessForecast[];
  readonly runbook: ReadinessRunbook;
};

const toReadinessRunId = (runId: RecoveryRunState['runId']): ReadinessRunId => withBrand(String(runId), 'ReadinessRunId');

const toSignalEnvelope = (signal: ReadinessSignal): ReadinessSignalEnvelope<Record<string, unknown>> => ({
  signal,
  envelope: {
    signal,
    timestamp: new Date().toISOString(),
    strategy: 'cadence-service',
    details: {
      runbook: signal.signalId,
    },
  },
  weight: 1,
});

export class CadenceDomainService {
  private readonly orchestrator: CadenceOrchestrator;

  constructor(orchestrator: CadenceOrchestrator = createCadenceOrchestrator()) {
    this.orchestrator = orchestrator;
  }

  buildArtifacts(input: OrchestrationInputs): CadenceWorkflowArtifact {
    const { run, session, steps, signals, constraints, violations, policy, forecasts, runbook } = input;
    const candidate = this.orchestrator.buildCandidateFromRun(
      run,
      session,
      steps,
      signals,
      constraints,
    );

    const projectedCandidate = projectCandidateSignals(candidate, mapSignalsToCadence(signals));
    const plan = this.orchestrator.buildPlan(projectedCandidate, 'dry-run', planIdSeed(run.runId));

    const mappedSignals = mapSignalsToCadence(signals);
    const candidateSignalCount = mappedSignals.length + violations.length;

    buildCadenceDashboardPayload(
      toReadinessRunId(run.runId),
      mappedSignals.map((entry) => toSignalEnvelope(entry.signal)),
      constraints,
      forecasts,
      violations,
      policy,
      runbook,
    );

    estimateRunCompletionMinutes(plan);

    return {
      id: plan.id,
      plan,
      candidate: projectedCandidate,
      signals: mappedSignals,
      candidateSignalCount,
    };
  }

  execute(context: { readonly runPlan: CadenceRunPlan; readonly run: RecoveryRunState; readonly session: RunSession; readonly seed: number }): CadenceRunPlan {
      return this.orchestrator.executePlan(context);
  }

  snapshot(): CadenceServiceSnapshot {
    const plans = this.orchestrator.fetchLatestPlans(25);
    const runIdSeed = plans[0]?.runId
      ? toReadinessRunId(plans[0].runId as unknown as RecoveryRunState['runId'])
      : toReadinessRunId(('fallback' as unknown) as RecoveryRunState['runId']);

    const candidates = plans.map(
      (plan): CadencePlanCandidate => ({
        profile: {
          tenant: plan.profile.tenant,
          programRun: plan.profile.programRun,
          windows: [...plan.windows],
          slots: [...plan.slots],
          priority: 'normal',
          source: plan.profile.source,
        },
        constraints: [
          {
            id: `snapshot-${String(plan.runId)}-constraints` as CadencePlanCandidate['constraints'][number]['id'],
            key: 'policy.blocked',
            expression: `${plan.policySummary.blockedByRules.join('|')}`,
            enabled: plan.policySummary.enabledConstraints > 0,
            weight: plan.policySummary.warnings.length > 0 ? 0.5 : 0.2,
          },
        ],
        notes: [...plan.policySummary.warnings],
        revision: Math.max(0, Math.floor(plan.readinessScore)),
      }),
    );

    const dashboard = buildCadenceDashboardPayload(
      runIdSeed,
      [],
      [],
      [],
      [],
      {
        policyId: 'snapshot',
        policyName: 'snapshot',
        mode: 'enforced',
        constraints: {
          policyId: 'snapshot',
          maxSignalsPerMinute: 100,
          minimumActiveTargets: 1,
          maxDirectiveRetries: 1,
          blackoutWindows: [],
        },
        allowedRegions: [],
        blockedSignalSources: ['telemetry'],
      },
      {
        runbookId: withBrand('snapshot', 'ReadinessRunbookId'),
        name: 'snapshot',
        strategy: 'balanced',
        state: {},
      },
    );

    return {
      createdAt: new Date().toISOString(),
      runId: plans[0]?.runId ? String(plans[0].runId) : `run:${Math.random().toString(36).slice(2, 8)}`,
      candidates,
      plans,
      dashboard,
    };
  }
}

export const createCadenceDomainService = (): CadenceDomainService => new CadenceDomainService();

const planIdSeed = (runId: RecoveryRunState['runId']): ReturnType<typeof mapToCadenceRunId> => {
  const readinessRunId: ReadinessRunId = toReadinessRunId(runId);
  return mapToCadenceRunId(readinessRunId);
};
