import { isHighRisk, estimateBudgetFromSignals, computeSessionScore } from '@domain/recovery-operations-models';
import type {
  IncidentFingerprint,
  RecoverySignal,
  RecoveryOperationsEnvelope,
  RunSession,
  RunPlanSnapshot,
  RunTicketId,
} from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { withBrand } from '@shared/core';
import { createOperationsMetrics } from './quality';
import { toDispatchSignalDigest } from './quality';

type PriorityBand = 'low' | 'medium' | 'high' | 'critical';

const BAND_THRESHOLDS: readonly [number, PriorityBand][] = [
  [0.3, 'low'],
  [0.55, 'medium'],
  [0.8, 'high'],
  [1, 'critical'],
] as const;

export interface PlanCandidate {
  readonly program: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
  readonly fingerprint: IncidentFingerprint;
}

export interface RunSessionPlan {
  readonly runId: RunSession['runId'];
  readonly ticketId: RunTicketId;
  readonly snapshot: RunPlanSnapshot;
  readonly score: number;
}

export const buildPlan = (candidate: PlanCandidate): RunSessionPlan => {
  const budget = estimateBudgetFromSignals(candidate.fingerprint, candidate.signals);
  const score = computeSessionScore(candidate.program, candidate.signals);
  const snapshot: RunPlanSnapshot = {
    id: `plan-${candidate.program.id}` as RunPlanSnapshot['id'],
    name: `${candidate.readinessPlan.title} / ${candidate.program.name}`,
    program: candidate.program,
    constraints: budget,
    fingerprint: candidate.fingerprint,
    sourceSessionId: undefined,
    effectiveAt: new Date().toISOString(),
  };

  return {
    runId: withBrand(`${candidate.readinessPlan.runId}`, 'RecoveryRunId'),
    ticketId: withBrand(`ticket-${candidate.program.id}`, 'RunTicketId'),
    snapshot,
    score,
  };
};

export const shouldRejectPlan = (candidate: PlanCandidate): boolean => {
  return isHighRisk(candidate.program, candidate.signals) || candidate.program.steps.length < 2;
};

export const envelopeForPlan = (plan: RunSessionPlan): RecoveryOperationsEnvelope<RunSessionPlan> => ({
  eventId: `${Date.now()}`,
  tenant: withBrand('recovery-tenant', 'TenantId'),
  payload: plan,
  createdAt: new Date().toISOString(),
});

const normalizeScore = (score: number): number => {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
};

const estimatePriority = (score: number): PriorityBand => {
  const normalized = normalizeScore(score);
  const match = BAND_THRESHOLDS.find((entry) => normalized <= entry[0]) ?? BAND_THRESHOLDS.at(-1);
  return match?.[1] ?? 'critical';
};

export interface SessionPlanContext {
  readonly runId: RunSessionPlan['runId'];
  readonly score: number;
  readonly signalCount: number;
}

export interface PlanReadinessAssessment {
  readonly score: number;
  readonly priority: PriorityBand;
  readonly canAutoRun: boolean;
  readonly riskBand: 'red' | 'amber' | 'green';
  readonly metrics: ReturnType<typeof createOperationsMetrics>;
}

export const buildPlanReadiness = (plan: RunSessionPlan, signalCount: number): PlanReadinessAssessment => {
  const score = normalizeScore(plan.score / 100);
  const priority = estimatePriority(score);
  const metrics = createOperationsMetrics(plan.runId, plan.score, signalCount);
  const riskBand = score >= 0.75 ? 'red' : score >= 0.45 ? 'amber' : 'green';
  return {
    score,
    priority,
    canAutoRun: score < 0.8,
    riskBand,
    metrics,
  };
};

export const describePlanReadiness = (assessment: PlanReadinessAssessment): string => {
  return [
    `run=${assessment.score}`,
    `priority=${assessment.priority}`,
    `canAutoRun=${assessment.canAutoRun}`,
    `risk=${assessment.riskBand}`,
    `signalDigest=${toDispatchSignalDigest(assessment.metrics)}`,
  ].join(' ');
};

export const buildSessionPlanContext = (plan: RunSessionPlan, signalCount: number): SessionPlanContext => ({
  runId: plan.runId,
  score: plan.score,
  signalCount,
});
