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
    name: `${candidate.readinessPlan.name} / ${candidate.program.name}`,
    program: candidate.program,
    constraints: budget,
    fingerprint: candidate.fingerprint,
    sourceSessionId: undefined,
    effectiveAt: new Date().toISOString(),
  };

  return {
    runId: candidate.readinessPlan.runId as RunSession['runId'],
    ticketId: `ticket-${candidate.program.id}` as RunTicketId,
    snapshot,
    score,
  };
};

export const shouldRejectPlan = (candidate: PlanCandidate): boolean => {
  return isHighRisk(candidate.program, candidate.signals) || candidate.program.steps.length < 2;
};

export const envelopeForPlan = (plan: RunSessionPlan): RecoveryOperationsEnvelope<RunSessionPlan> => ({
  eventId: `${Date.now()}`,
  tenant: 'recovery-tenant',
  payload: plan,
  createdAt: new Date().toISOString(),
});
