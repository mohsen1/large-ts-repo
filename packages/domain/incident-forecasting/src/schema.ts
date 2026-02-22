import { z } from 'zod';
import type { IncidentForecastPlan, SignalObservation, ForecastMetrics } from './types';

export const signalSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  sourceSystem: z.string().min(1),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  confidence: z.number().min(0).max(1),
  eventType: z.string().min(1),
  metadata: z.record(z.unknown()),
  observedAt: z.string().datetime(),
});

export const forecastMetricsSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  contributingSignals: z.array(z.string()),
  predictedDowntimeMinutes: z.number().int().min(0),
});

export const planSchema = z.object({
  planId: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  triggers: z.array(z.string()),
  playbookSteps: z.array(z.string()),
  generatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const validateSignal = (input: unknown): SignalObservation => signalSchema.parse(input) as SignalObservation;
export const validateForecastMetrics = (input: unknown): ForecastMetrics => forecastMetricsSchema.parse(input);
export const validatePlan = (input: unknown): IncidentForecastPlan => planSchema.parse(input);
