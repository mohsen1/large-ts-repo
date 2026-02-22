import { z } from 'zod';

export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
  occurredAt: z.string().datetime(),
  tenantId: z.string().min(1),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const IngestionBatchSchema = z.object({
  id: z.string().uuid(),
  receivedAt: z.string().datetime(),
  events: z.array(EventEnvelopeSchema).min(1).max(500),
});

export type IngestionBatch = z.infer<typeof IngestionBatchSchema>;
