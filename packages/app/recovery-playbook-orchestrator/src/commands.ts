import { z } from 'zod';

export const PlaybookCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prepare'),
    tenantId: z.string(),
    serviceId: z.string(),
    incidentType: z.string(),
    affectedRegions: z.array(z.string()).default([]),
    requestedBy: z.string(),
  }),
  z.object({
    type: z.literal('finish'),
    runId: z.string(),
    status: z.enum(['pending', 'running', 'paused', 'completed', 'failed']),
  }),
]);

export type PlaybookCommand = z.infer<typeof PlaybookCommandSchema>;

export const parsePlaybookCommand = (payload: unknown): PlaybookCommand => {
  return PlaybookCommandSchema.parse(payload);
};
