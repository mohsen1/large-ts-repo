import { z } from 'zod';

export const signalSchema = z.object({
  signalId: z.string(),
  runId: z.string(),
  targetId: z.string(),
  source: z.enum(['telemetry', 'synthetic', 'manual-check']),
  name: z.string().min(3),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  capturedAt: z.string(),
  details: z.record(z.unknown())
});

export const planSchema = z.object({
  planId: z.string(),
  runId: z.string(),
  title: z.string().min(1),
  objective: z.string().min(1),
  state: z.enum(['draft', 'approved', 'active', 'suppressed', 'complete', 'failed']),
  createdAt: z.string(),
  metadata: z.object({
    owner: z.string().min(1),
    tags: z.array(z.string())
  })
});

export const draftSchema = z.object({
  runId: z.string(),
  title: z.string().min(1),
  objective: z.string().min(1),
  owner: z.string().min(1),
  targetIds: z.array(z.string()),
  directiveIds: z.array(z.string())
});
