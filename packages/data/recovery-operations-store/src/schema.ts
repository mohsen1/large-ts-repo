import { z } from 'zod';

import type { RunSessionRecord, SessionQueryFilter } from './models';

const statusSchema = z.enum(['queued', 'warming', 'running', 'blocked', 'completed', 'failed', 'aborted']);

const modelSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  ticketId: z.string().min(1),
  planId: z.string().min(1),
  status: statusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tenant: z.string().min(1),
  constraints: z.object({
    maxParallelism: z.number().int().min(1).max(64),
    maxRetries: z.number().int().min(0).max(12),
    timeoutMinutes: z.number().int().min(1).max(24 * 60),
    operatorApprovalRequired: z.boolean(),
  }),
  signals: z.array(z.record(z.unknown())),
});

const filterSchema = z.object({
  tenant: z.string().optional(),
  runId: z.string().optional(),
  ticketId: z.string().optional(),
  status: z.union([statusSchema, statusSchema.array()]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const parseSessionRecord = (input: unknown): RunSessionRecord => modelSchema.parse(input);
export const parseFilter = (input: unknown): SessionQueryFilter => filterSchema.parse(input);
