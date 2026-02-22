import { z } from 'zod';
import { eventKindPriority, severityRank } from './vocabulary';

const utc = z
  .string()
  .datetime({ offset: true })
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'invalid timestamp' });

const runState = z.enum(['planned', 'running', 'paused', 'succeeded', 'degraded', 'failed', 'cancelled']);
const severity = z.enum(['info', 'warn', 'degrade', 'error', 'critical']);
const eventKind = z.enum(['signal', 'metric', 'transition', 'checkpoint', 'anomaly']);

export const recoveryTelemetryMetricSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  baseline: z.number(),
  current: z.number(),
  minSafe: z.number(),
  maxSafe: z.number(),
});

export const recoveryTelemetryEventSchema = z.object({
  kind: eventKind,
  at: utc,
  runId: z.string().min(1),
  tenant: z.string().min(1),
  scenarioId: z.string().min(1),
  stepId: z.string().optional(),
  severity,
  title: z.string().min(1),
  payload: z.record(z.unknown()),
});

export const recoveryMetricSampleSchema = z.object({
  metric: recoveryTelemetryMetricSchema,
  eventId: z.string().min(1),
  correlationId: z.string().min(1),
  observedAt: utc,
});

export type RecoveryTelemetryMetricInput = z.input<typeof recoveryTelemetryMetricSchema>;
export type RecoveryTelemetryEventInput = z.input<typeof recoveryTelemetryEventSchema>;
export type RecoveryMetricSampleInput = z.input<typeof recoveryMetricSampleSchema>;

export const severityToRank = (value: z.infer<typeof severity>): number => severityRank[value];
export const kindToPriority = (value: z.infer<typeof eventKind>): number => eventKindPriority[value];

export const parseRunState = (value: unknown) => runState.parse(value);
export const normalizeRunState = parseRunState;

export const validateEvent = (input: unknown) => recoveryTelemetryEventSchema.parse(input);
export const validateMetricSample = (input: unknown) => recoveryMetricSampleSchema.parse(input);
