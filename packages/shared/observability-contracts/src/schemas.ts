import { z } from 'zod';
import { TraceEnvelope, TraceEnvelopeSchema } from './types';

export const correlationHeader = z.object({
  'x-correlation-id': z.string().uuid().optional(),
  'x-tenant-id': z.string().min(1),
  'x-service-id': z.string().min(1),
  'x-region': z.string().min(2).max(16),
  'x-revision': z.coerce.number().int().nonnegative(),
});

export const parseTraceEnvelope = (value: unknown): TraceEnvelope => {
  return TraceEnvelopeSchema.parse(value) as TraceEnvelope;
};

export const maybeTraceEnvelope = (value: unknown): value is TraceEnvelope => {
  return TraceEnvelopeSchema.safeParse(value).success;
};
