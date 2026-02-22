import { z } from 'zod';

import type { RiskDimension, RiskEnvelope, RiskSignal, RiskSeverity } from './types';
import type { Brand } from '@shared/core';

const riskDimensionSchema = z.enum(['blastRadius', 'recoveryLatency', 'dataLoss', 'dependencyCoupling', 'compliance']) as z.ZodType<RiskDimension>;
const riskSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']) as z.ZodType<RiskSeverity>;

const riskSignalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  source: z.enum(['sre', 'telemetry', 'policy', 'incidentFeed', 'manual']),
  observedAt: z.string().datetime(),
  metricName: z.string().min(1),
  dimension: riskDimensionSchema,
  value: z.number().finite(),
  weight: z.number().min(0).max(1),
  tags: z.array(z.string()),
  context: z.record(z.string()),
});

const riskContextSchema = z.object({
  programId: z.string().min(1),
  runId: z.string().min(1),
  tenant: z.string().min(1),
  currentStatus: z.enum(['draft', 'staging', 'running', 'completed', 'aborted', 'failed']),
  allowedWindow: z.object({
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
    timezone: z.string().min(1),
    horizonMinutes: z.number().positive(),
  }),
});

const riskEnvelopeSchema: z.ZodType<RiskEnvelope, z.ZodTypeDef, unknown> = z.object({
  assessment: z.object({
    assessmentId: z.string().min(1),
    profileId: z.string().min(1),
    score: z.number().min(0),
    dimensionScores: z.record(
      riskDimensionSchema,
      z.number().min(0).max(100),
    ) as z.ZodType<Record<RiskDimension, number>>,
    severity: riskSeveritySchema,
    findings: z.array(z.object({
      factorName: z.string().min(1),
      dimension: riskDimensionSchema,
      severity: riskSeveritySchema,
      score: z.number().min(0).max(100),
      recommendation: z.string().min(1),
    })),
    normalizedAt: z.string().datetime(),
  }),
  context: riskContextSchema,
  signals: z.array(riskSignalSchema),
});

export const parseRiskSignal = (value: unknown): RiskSignal => {
  const parsed = riskSignalSchema.parse(value);
  return {
    ...parsed,
    id: parsed.id as Brand<string, 'RiskSignalId'>,
    runId: parsed.runId as Brand<string, 'RiskRunId'>,
    tags: parsed.tags,
    context: parsed.context,
  };
};

export const parseRiskEnvelope = (value: unknown): RiskEnvelope => {
  return riskEnvelopeSchema.parse(value);
};
