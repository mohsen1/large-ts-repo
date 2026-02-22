import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoverySignal, RunSession } from '@domain/recovery-operations-models';
import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import { calculateSignalDensity } from '@data/recovery-operations-analytics';
import { summarizeTopology, buildProgramTopology, type TopologySummary } from '@domain/recovery-operations-models';
import {
  runPolicyLedger,
  reduceGateResults,
  buildDefaultPolicyContext,
  buildPolicyEnvelope,
  type PolicyScope,
} from '@domain/recovery-operations-models';
import { createOperationsMetrics } from './quality';
import type { PlanCandidate } from './plan';

interface ReadinessTargetEnvelope {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
}

export interface ReadinessSignalPolicy {
  readonly scope: PolicyScope;
  readonly decision: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ReadinessAssessment {
  readonly runId: RecoveryRunState['runId'];
  readonly ready: boolean;
  readonly readinessScore: number;
  readonly summary: TopologySummary;
  readonly policy: ReadinessSignalPolicy;
  readonly signalDensity: ReturnType<typeof calculateSignalDensity>;
}

export interface ReadinessExecutionPlan {
  readonly runId: RecoveryRunState['runId'];
  readonly commands: readonly string[];
  readonly summary: TopologySummary;
}

const readnessPlanId = (plan: RecoveryReadinessPlan): string => String(plan.planId);

const buildProgramFromReadiness = (readiness: RecoveryReadinessPlan, signals: readonly RecoverySignal[]): RecoveryProgram => {
  return {
    id: withBrand(readnessPlanId(readiness), 'RecoveryProgramId'),
    tenant: withBrand(readiness.runId, 'TenantId'),
    service: withBrand(readiness.metadata.owner, 'ServiceId'),
    name: readiness.title,
    description: readiness.objective,
    priority: 'silver',
    mode: readiness.riskBand === 'red' ? 'emergency' : 'defensive',
    window: {
      startsAt: readiness.windows[0]?.fromUtc ?? new Date().toISOString(),
      endsAt: readiness.windows[0]?.toUtc ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: readiness.windows[0]?.timezone ?? 'UTC',
    },
    topology: {
      rootServices: readiness.targets.map((target) => target.ownerTeam),
      fallbackServices: ['recovery-default'],
      immutableDependencies: [],
    },
    constraints: [],
    steps: signals.slice(0, 8).map((signal, index) => ({
      id: `${signal.id}-${index}`,
      title: signal.id,
      command: `signal:${signal.source}`,
      timeoutMs: 1_000 + index * 100,
      dependencies: index > 0 ? [`${signals[index - 1]?.id}-${index - 1}`] : [],
      requiredApprovals: index % 2,
      tags: ['readiness', signal.source],
    })),
    owner: readiness.metadata.owner,
    tags: [readiness.riskBand, readiness.metadata.owner],
    createdAt: readiness.windows[0]?.fromUtc ?? new Date().toISOString(),
    updatedAt: readiness.windows[0]?.toUtc ?? new Date().toISOString(),
  };
};

const computeReadinessPolicy = (
  runId: RecoveryRunState['runId'],
  readiness: RecoveryReadinessPlan,
  signals: readonly RecoverySignal[],
  scope: PolicyScope = 'global',
): ReadinessSignalPolicy => {
  const context = buildDefaultPolicyContext(withBrand(readiness.runId, 'TenantId'), signals);
  const results = runPolicyLedger({ scope, context, signals, fingerprint: readiness.targets[0] ? {
    tenant: withBrand(readiness.runId, 'TenantId'),
    region: readiness.targets[0].region,
    serviceFamily: readiness.targets[0].ownerTeam,
    impactClass: readiness.riskBand === 'red' ? 'infrastructure' : readiness.riskBand === 'amber' ? 'database' : 'application',
    estimatedRecoveryMinutes: readiness.targets.length * 5,
  } : undefined }, scope);
  const reduced = reduceGateResults(results);
  const policyRules = buildPolicyEnvelope({
    scope,
    context,
    signals,
    fingerprint: readiness.targets[0] ? {
      tenant: withBrand(readiness.runId, 'TenantId'),
      region: readiness.targets[0].region,
      serviceFamily: readiness.targets[0].ownerTeam,
      impactClass: readiness.riskBand === 'red' ? 'infrastructure' : readiness.riskBand === 'amber' ? 'database' : 'application',
      estimatedRecoveryMinutes: readiness.targets.length * 5,
    } : undefined,
  }, scope);
  void policyRules;

  return {
    scope,
    decision: reduced.decision,
    score: reduced.score,
    reasons: policyRules.map((result) => result.reasonCode),
  };
};

export const evaluateReadiness = (
  candidate: ReadinessTargetEnvelope,
  run: RecoveryRunState,
  session: RunSession,
): ReadinessAssessment => {
  const policy = computeReadinessPolicy(run.runId, candidate.readinessPlan, candidate.signals, 'global');
  const topology = buildProgramTopology(buildProgramFromReadiness(candidate.readinessPlan, candidate.signals));
  const summary = summarizeTopology(buildProgramFromReadiness(candidate.readinessPlan, candidate.signals));
  const signalDensity = calculateSignalDensity(String(session.runId), candidate.tenant, candidate.signals);
  const metrics = createOperationsMetrics(String(run.runId), session.signals.length, candidate.signals.length);
  const score = Number((metrics.score + summary.averageTimeoutMs / 1000).toFixed(3));

  return {
    runId: run.runId,
    ready: policy.decision !== 'block' && score >= 0.3 && topology.summary.stepCount > 0,
    readinessScore: Math.min(1, score / 100),
    summary,
    policy,
    signalDensity,
  };
};

export const buildExecutionPlanFromReadiness = (
  readinessPlan: RecoveryReadinessPlan,
  run: RecoveryRunState,
  signals: readonly RecoverySignal[],
): ReadinessExecutionPlan => {
  const program = buildProgramFromReadiness(readinessPlan, signals);
  const topology = buildProgramTopology(program);
  const commands = topology.layers.flatMap((layer) =>
    layer.stepIds.map((stepId) => `${layer.index}:${stepId}`),
  );
  return {
    runId: run.runId,
    commands,
    summary: summarizeTopology(program),
  };
};

export const mapReadinessToExecution = (
  readinessPlan: RecoveryReadinessPlan,
  run: RecoveryRunState,
  signals: readonly RecoverySignal[],
  candidate: PlanCandidate,
): ReadinessExecutionPlan => {
  const resolvedRunId = withBrand(run.runId, 'RunSessionId');
  const baseRun = {
    ...({} as RunSession),
    runId: run.runId,
    id: resolvedRunId,
    ticketId: withBrand('ticket', 'RunTicketId'),
    planId: withBrand('plan', 'RunPlanId'),
    status: 'queued' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    constraints: {
      maxParallelism: 1,
      maxRetries: 1,
      timeoutMinutes: 30,
      operatorApprovalRequired: false,
    },
    signals,
  } satisfies RunSession;
  const assessment = evaluateReadiness(
    { tenant: String(candidate.fingerprint.tenant), readinessPlan, signals },
    run,
    baseRun,
  );

  if (!assessment.ready) {
    return { runId: run.runId, commands: ['hold'], summary: assessment.summary };
  }

  return buildExecutionPlanFromReadiness(readinessPlan, run, signals);
};
