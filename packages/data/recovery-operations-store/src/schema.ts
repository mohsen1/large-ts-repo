import { z } from 'zod';

import type { RunSessionRecord, SessionQueryFilter } from './models';
import { withBrand } from '@shared/core';

const statusSchema = z.enum(['queued', 'warming', 'running', 'blocked', 'completed', 'failed', 'aborted']);
const signalSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  severity: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime(),
  details: z.record(z.unknown()),
});

const modelSchema = z.object({
  id: z.string().min(1).transform((value) => withBrand(value, 'RunSessionId')),
  runId: z.string().min(1).transform((value) => withBrand(value, 'RecoveryRunId')),
  ticketId: z.string().min(1).transform((value) => withBrand(value, 'RunTicketId')),
  planId: z.string().min(1).transform((value) => withBrand(value, 'RunPlanId')),
  status: statusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tenant: z.string().min(1).transform((value) => withBrand(value, 'TenantId')),
  constraints: z.object({
    maxParallelism: z.number().int().min(1).max(64),
    maxRetries: z.number().int().min(0).max(12),
    timeoutMinutes: z.number().int().min(1).max(24 * 60),
    operatorApprovalRequired: z.boolean(),
  }),
  signals: z.array(signalSchema),
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
