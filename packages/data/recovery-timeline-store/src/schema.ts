import { z } from 'zod';

export const TimelineFilterSchema = z.object({
  timelineId: z.string().optional(),
  ownerTeam: z.string().optional(),
  minRiskScore: z.number().min(0).max(100).optional(),
  maxRiskScore: z.number().min(0).max(100).optional(),
  state: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']).optional(),
  query: z.string().max(120).optional(),
  includeSegments: z.boolean().optional(),
});

export type TimelineFilter = z.infer<typeof TimelineFilterSchema>;

export const TimelineCommandPayloadSchema = z.object({
  timelineId: z.string().min(1),
  eventIds: z.array(z.string()),
  actor: z.string().optional(),
  notes: z.string().optional(),
});

export type TimelineCommandPayload = z.infer<typeof TimelineCommandPayloadSchema>;
