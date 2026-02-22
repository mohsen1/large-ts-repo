import { z } from 'zod';

export const launchRequestSchema = z.object({
  planId: z.string().uuid(),
  tenantId: z.string(),
  requestedBy: z.string(),
  dryRun: z.boolean().default(false),
  targetRegion: z.string(),
  tags: z.record(z.unknown()).default({}),
});

export const stepCommandSchema = z.object({
  runId: z.string().uuid(),
  stepId: z.string(),
  command: z.enum(['start', 'skip', 'retry', 'cancel']),
  note: z.string().max(500).optional(),
  actor: z.string(),
});

export const eventBridgeEventSchema = z.object({
  Source: z.string(),
  DetailType: z.string(),
  Detail: z.record(z.unknown()),
  EventBusName: z.string(),
});

export type LaunchRequest = z.infer<typeof launchRequestSchema>;
export type StepCommand = z.infer<typeof stepCommandSchema>;
