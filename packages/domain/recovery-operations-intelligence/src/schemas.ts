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

const BucketSchema = z.enum(['low', 'medium', 'high', 'critical']) as z.ZodType<SignalDensityBucket>;
const RunIdSchema = z.string().transform((value) => withBrand(value, 'IntelligenceRunId')) as z.ZodType<IntelligenceRunId>;
const DecisionSetIdSchema = z.string().transform((value) => withBrand(value, 'DecisionSetId')) as z.ZodType<DecisionSetId>;

const SourceSchema = z.enum(['telemetry', 'queue', 'manual', 'policy']);

const WindowSchema = z.object({
  tenant: z.string().transform((value) => withBrand(value, 'TenantId')),
  from: z.string().datetime(),
  to: z.string().datetime(),
  zone: z.string().min(1),
}) as z.ZodType<SignalWindow>;

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
}) as z.ZodType<RecoveryRiskSignal>;

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
  plan: z.unknown(),
}) as z.ZodType<RunAssessment>;

const CohortSchema = z.object({
  tenant: z.string().min(1).transform((value) => withBrand(value, 'TenantId')),
  runId: RunIdSchema,
  count: z.number().int().min(0),
  maxConfidence: z.number().min(0).max(1),
  distinctSources: z.array(SourceSchema),
}) as z.ZodType<CohortSignalAggregate>;

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
