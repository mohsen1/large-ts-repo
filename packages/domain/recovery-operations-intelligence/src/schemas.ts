import { z } from 'zod';
import { withBrand } from '@shared/core';
import type {
  IntelligenceRunId,
  DecisionSetId,
  SignalDensityBucket,
  SignalWindow,
  RecoveryRiskSignal,
  RunAssessment,
  CohortSignalAggregate,
} from './types';

const BucketSchema: z.ZodType<SignalDensityBucket, z.ZodTypeDef, string> =
  z.enum(['low', 'medium', 'high', 'critical']);
const RunIdSchema: z.ZodType<IntelligenceRunId, z.ZodTypeDef, string> =
  z.string().transform((value): IntelligenceRunId => withBrand(value, 'IntelligenceRunId'));
const DecisionSetIdSchema: z.ZodType<DecisionSetId, z.ZodTypeDef, string> =
  z.string().transform((value): DecisionSetId => withBrand(value, 'DecisionSetId'));

const SourceSchema = z.enum(['telemetry', 'queue', 'manual', 'policy']);

const WindowSchema: z.ZodType<
  SignalWindow,
  z.ZodTypeDef,
  {
    tenant: string;
    from: string;
    to: string;
    zone: string;
  }
> = z.object({
  tenant: z.string().transform((value): SignalWindow['tenant'] => withBrand(value, 'TenantId')),
  from: z.string().datetime(),
  to: z.string().datetime(),
  zone: z.string().min(1),
});

const SignalSchema = z.object({
  runId: RunIdSchema,
  envelopeId: z.string().min(1),
  source: SourceSchema,
  signal: z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    severity: z.number().min(1).max(10),
    confidence: z.number().min(0).max(1),
    detectedAt: z.string().datetime(),
    details: z.record(z.unknown()),
  }),
  window: WindowSchema,
  tags: z.array(z.string()),
});

const PlanSchema: z.ZodType<
  RunAssessment['plan'],
  z.ZodTypeDef,
  unknown
> = z.unknown().transform((value): RunAssessment['plan'] => value as RunAssessment['plan']);

const AssessmentSchema = z.object({
  runId: RunIdSchema,
  tenant: z.string().min(1),
  riskScore: z.number().finite(),
  confidence: z.number().min(0).max(1),
  bucket: BucketSchema,
  intensity: z.object({
    bucket: BucketSchema,
    averageSeverity: z.number().min(0).max(10),
    signalCount: z.number().int().min(0),
  }),
  constraints: z.object({
    maxParallelism: z.number().int().min(1),
    maxRetries: z.number().int().min(0),
    timeoutMinutes: z.number().int().min(1),
    operatorApprovalRequired: z.boolean(),
  }),
  recommendedActions: z.array(z.string()),
  plan: PlanSchema,
});

const CohortSchema = z.object({
  tenant: z.string().min(1).transform((value) => withBrand(value, 'TenantId')),
  runId: RunIdSchema,
  count: z.number().int().min(0),
  maxConfidence: z.number().min(0).max(1),
  distinctSources: z.array(SourceSchema),
});

const DecisionSetSchema = z.object({
  id: DecisionSetIdSchema,
  tenant: z.string().min(1),
  generatedAt: z.string().datetime(),
  assessments: z.array(AssessmentSchema),
  batchRisk: z.enum(['green', 'amber', 'red']),
});

export const parseRunAssessment = (input: unknown): RunAssessment => AssessmentSchema.parse(input);
export const parseSignalWindow = (input: unknown): SignalWindow => WindowSchema.parse(input);
export const parseRecoveryRiskSignal = (input: unknown): RecoveryRiskSignal => SignalSchema.parse(input);
export const parseDecisionSet = (input: unknown) => DecisionSetSchema.parse(input);
export const parseCohortSignalAggregate = (input: unknown): CohortSignalAggregate => CohortSchema.parse(input);
