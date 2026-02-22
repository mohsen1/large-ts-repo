import { z } from 'zod';

import type {
  ActionCandidate,
  IncidentId,
  IncidentSignal,
  IncidentSignalId,
  SignalBundle,
  TenantId,
} from './types';

export const signalDimensionSchema = z.enum(['infrastructure', 'security', 'traffic', 'data-plane', 'control-plane']);
export const signalSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const signalUrgencySchema = z.enum(['normal', 'elevated', 'urgent']);
export const signalSeverityScoreSchema = z.number().min(0).max(1);

const toIncidentSignalId = (value: string): IncidentSignalId => value as IncidentSignalId;
const toTenantId = (value: string): TenantId => value as TenantId;
const toIncidentId = (value: string): IncidentId => value as IncidentId;
const toActionId = (value: string): ActionCandidate['actionId'] => value as ActionCandidate['actionId'];
const toPrereq = (value: string): ActionCandidate['prerequisites'][number] =>
  value as ActionCandidate['prerequisites'][number];
const toSignalBundleId = (value: string): SignalBundle['bundleId'] => value as SignalBundle['bundleId'];

export const incidentSignalSchema = z.object({
  signalId: z.string().min(1).transform((value) => toIncidentSignalId(value)),
  tenantId: z.string().min(1).transform((value) => toTenantId(value)),
  incidentId: z.string().min(1).transform((value) => toIncidentId(value)),
  dimension: signalDimensionSchema,
  severity: signalSeveritySchema,
  urgency: signalUrgencySchema,
  source: z.string().min(1),
  createdAt: z.string().datetime(),
  confidence: signalSeverityScoreSchema,
  tags: z.array(z.string().min(1)),
  payload: z.record(z.unknown()),
});

export const signalWindowSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  signals: z.array(incidentSignalSchema),
});

export const signalBundleSchema = z.object({
  bundleId: z.string().min(1).transform((value) => toSignalBundleId(value)),
  tenantId: z.string().min(1).transform((value) => toTenantId(value)),
  incidentId: z.string().min(1).transform((value) => toIncidentId(value)),
  generatedAt: z.string().datetime(),
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

export const parseIncidentSignal = (input: unknown): IncidentSignal => incidentSignalSchema.parse(input);
export const parseSignalBundle = (input: unknown): SignalBundle => signalBundleSchema.parse(input);
export const parseActionId = (value: string): ActionCandidate['actionId'] => toActionId(value);
export const parsePrereq = (value: string): ActionCandidate['prerequisites'][number] => toPrereq(value);

export type ParsedIncidentSignal = z.infer<typeof incidentSignalSchema>;
export type ParsedSignalBundle = z.infer<typeof signalBundleSchema>;
