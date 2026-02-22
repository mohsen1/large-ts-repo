import { z } from 'zod';

export const signalDimensionSchema = z.enum(['infrastructure', 'security', 'traffic', 'data-plane', 'control-plane']);
export const signalSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const signalUrgencySchema = z.enum(['normal', 'elevated', 'urgent']);
export const signalSeverityScoreSchema = z.number().min(0).max(1);

export const incidentSignalSchema = z.object({
  signalId: z.string().min(1),
  tenantId: z.string().min(1),
  incidentId: z.string().min(1),
  dimension: signalDimensionSchema,
  severity: signalSeveritySchema,
  urgency: signalUrgencySchema,
  source: z.string().min(1),
  createdAt: z.iso.datetime(),
  confidence: signalSeverityScoreSchema,
  tags: z.array(z.string().min(1)),
  payload: z.record(z.unknown()),
});

export const signalWindowSchema = z.object({
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  signals: z.array(incidentSignalSchema),
});

export const signalBundleSchema = z.object({
  bundleId: z.string().min(1),
  tenantId: z.string().min(1),
  incidentId: z.string().min(1),
  generatedAt: z.iso.datetime(),
  window: signalWindowSchema,
  vectors: z.array(
    z.object({
      dimension: signalDimensionSchema,
      score: z.number(),
      normalizedScore: z.number(),
      evidenceCount: z.number().int().nonnegative(),
    }),
  ),
  metadata: z.object({
    sourceSystems: z.array(z.string().min(1)),
    sampleRateSeconds: z.number().int().positive(),
    algorithm: z.string().min(1),
  }),
});

export type ParsedIncidentSignal = z.infer<typeof incidentSignalSchema>;
export type ParsedSignalBundle = z.infer<typeof signalBundleSchema>;
