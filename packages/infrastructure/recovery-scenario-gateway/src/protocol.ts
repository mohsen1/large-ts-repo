import { z } from 'zod';
import type { RecoveryPlan, RecoveryRun, RecoveryState } from '@domain/recovery-scenario-orchestration';
import type { ConstraintSnapshot } from '@domain/recovery-scenario-orchestration';

export type EnvelopeStatus = 'queued' | 'accepted' | 'rejected' | 'retry';

export interface OutboundEnvelope<TPayload> {
  readonly envelopeType: string;
  readonly emittedAt: string;
  readonly source: string;
  readonly correlationId: string;
  readonly payload: TPayload;
}

export interface InboundCommand {
  readonly type: 'start' | 'pause' | 'resume' | 'abort';
  readonly actor: string;
  readonly reason?: string;
}

export interface PlanEnvelope {
  readonly status: EnvelopeStatus;
  readonly plan: RecoveryPlan;
  readonly run: RecoveryRun | null;
  readonly reasonCodes: readonly string[];
}

export interface ConstraintEnvelope {
  readonly status: EnvelopeStatus;
  readonly constraints: readonly ConstraintSnapshot[];
  readonly blockingCount: number;
}

export const envelopeSchema = z.object({
  envelopeType: z.string().min(1),
  emittedAt: z.string().min(1),
  source: z.string().min(1),
  correlationId: z.string().min(1),
});

export const isFinalState = (state: RecoveryState): boolean =>
  state === 'resolved' || state === 'failed' || state === 'rolledBack';

export const classify = (code: number): EnvelopeStatus => {
  if (code >= 200 && code < 300) {
    return 'accepted';
  }
  if (code >= 400 && code < 500) {
    return 'rejected';
  }
  return 'retry';
};

export const planEnvelope = (plan: RecoveryPlan, run: RecoveryRun | null): PlanEnvelope => {
  return {
    status: plan.state === 'running' ? 'accepted' : 'queued',
    plan,
    run,
    reasonCodes: ['policy-applied', `state:${plan.state}`],
  };
};

export const constraintEnvelope = (
  constraints: readonly ConstraintSnapshot[],
): ConstraintEnvelope => ({
  status: constraints.some((item) => item.state === 'violated') ? 'rejected' : 'accepted',
  constraints,
  blockingCount: constraints.filter((item) => item.state === 'violated').length,
});
