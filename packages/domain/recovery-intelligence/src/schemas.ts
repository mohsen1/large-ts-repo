import { z } from 'zod';
import type { RecoveryActionCandidate, RecoveryRecommendation, RecoverySignalBundle, RecoveryForecast } from './types';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .brand<'iso-date'>();

const brand = <T extends z.ZodTypeAny>(schema: T, name: string) =>
  schema.brand<T>(`brand:${name}` as never);

export const SignalCategorySchema = z.enum(['availability', 'latency', 'dataQuality', 'compliance']);

export const RecoverySignalSchema = z.object({
  signalId: brand(z.string(), 'signal-id'),
  tenantId: brand(z.string(), 'tenant-id'),
  source: z.string().min(2),
  category: SignalCategorySchema,
  severity: z.number().min(0).max(1),
  observedAt: isoDate,
  ttlAt: isoDate,
  fingerprint: brand(z.string(), 'fingerprint'),
  attributes: z.record(z.unknown()),
});

export const RecoveryContextSnapshotSchema = z.object({
  tenantId: brand(z.string(), 'tenant-id'),
  runId: brand(z.string(), 'run-id'),
  serviceName: z.string(),
  zone: z.string(),
  startedAt: isoDate,
  metadata: z.record(z.unknown()),
});

export const RecoverySignalBundleSchema = z.object({
  bundleId: brand(z.string(), 'bundle-id'),
  context: RecoveryContextSnapshotSchema,
  signals: z.array(RecoverySignalSchema).min(1),
  policy: z.record(z.unknown()),
  expectedRecoveryMinutes: z.number().int().nonnegative(),
});

export const ActionCandidateSchema = z.object({
  actionId: brand(z.string(), 'action-id'),
  targetService: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().min(0.1),
  prerequisites: z.array(brand(z.string(), 'action-prerequisite')),
  rollbackMinutes: z.number().min(0),
});

export const RecommendationSchema = z.object({
  recommendationId: brand(z.string(), 'recommendation-id'),
  score: z.number().min(0).max(1),
  bucket: z.enum(['low', 'medium', 'high', 'critical']),
  rationale: z.string(),
  actions: z.array(ActionCandidateSchema),
  predictedRiskReduction: z.number().min(0).max(1),
});

export const ForecastSchema = z.object({
  forecastId: brand(z.string(), 'forecast-id'),
  context: RecoveryContextSnapshotSchema,
  signalDensity: z.number().nonnegative(),
  meanRecoveryMinutes: z.number().positive(),
  confidence: z.number().min(0).max(1),
  confidenceBySignal: z.record(z.number().min(0).max(1)),
});

export const parseBundle = (value: unknown): RecoverySignalBundle => RecoverySignalBundleSchema.parse(value);
export const parseRecommendation = (value: unknown): RecoveryRecommendation => RecommendationSchema.parse(value);
export const parseForecast = (value: unknown): RecoveryForecast => ForecastSchema.parse(value);
