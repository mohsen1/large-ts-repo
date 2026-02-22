import { z } from 'zod';

import { withBrand } from '@shared/core';
import { parseRecoveryProgram } from '@domain/recovery-orchestration';

const RecoveryClassSchema = z.enum(['infrastructure', 'database', 'network', 'application', 'third-party']);
const SessionStatusSchema = z.enum(['queued', 'warming', 'running', 'blocked', 'completed', 'failed', 'aborted']);

const ConstraintSchema = z.object({
  maxParallelism: z.number().int().min(1).max(64),
  maxRetries: z.number().int().min(0).max(12),
  timeoutMinutes: z.number().int().min(1).max(24 * 60),
  operatorApprovalRequired: z.boolean(),
});

const FingerprintSchema = z.object({
  tenant: z.string().min(1).transform((value) => withBrand(value, 'TenantId')),
  region: z.string().min(1),
  serviceFamily: z.string().min(1),
  impactClass: z.string().transform((value) => RecoveryClassSchema.parse(value)),
  estimatedRecoveryMinutes: z.number().finite().positive(),
});

const SignalSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  severity: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime(),
  details: z.record(z.unknown()),
});

const SessionSchema = z.object({
  id: z.string().min(1).transform((value) => withBrand(value, 'RunSessionId')),
  runId: z.string().min(1).transform((value) => withBrand(value, 'RecoveryRunId')),
  ticketId: z.string().min(1).transform((value) => withBrand(value, 'RunTicketId')),
  planId: z.string().min(1).transform((value) => withBrand(value, 'RunPlanId')),
  status: SessionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  constraints: ConstraintSchema,
  signals: z.array(SignalSchema),
});

const PlanSnapshotSchema = z.object({
  id: z.string().min(1).transform((value) => withBrand(value, 'RunPlanId')),
  name: z.string().min(1),
  constraints: ConstraintSchema,
  fingerprint: FingerprintSchema,
  sourceSessionId: z.string().optional().transform((value) => (value ? withBrand(value, 'RunSessionId') : undefined)),
  effectiveAt: z.string().datetime(),
  program: z.unknown(),
});

const EnvelopeSchema = z.object({
  eventId: z.string().min(1),
  tenant: z.string().min(1).transform((value) => withBrand(value, 'TenantId')),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
});

const SessionDecisionSchema = z.object({
  runId: z.string().min(1).transform((value) => withBrand(value, 'RecoveryRunId')),
  ticketId: z.string().min(1).transform((value) => withBrand(value, 'RunTicketId')),
  accepted: z.boolean(),
  reasonCodes: z.array(z.string()),
  score: z.number().finite(),
  createdAt: z.string().datetime(),
});

export const parseRunPlanSnapshot = (input: unknown) => {
  const parsed = PlanSnapshotSchema.parse(input);
  return {
    ...parsed,
    program: parseRecoveryProgram(parsed.program as never),
  } as ReturnType<typeof parseRecoveryProgram> & typeof parsed;
};

export const parseRunSession = (input: unknown) => SessionSchema.parse(input);
export const parseRunDecision = (input: unknown) => SessionDecisionSchema.parse(input);
export const parseEnvelope = (input: unknown) => EnvelopeSchema.parse(input);
