import { z } from 'zod';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { StoreQuery } from './types';
import type { IncidentId, RunId, TenantId } from '@domain/recovery-incident-insights/src';

const querySchema = z.object({
  tenantId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().positive().max(5000).optional(),
});

export interface NormalizedQuery {
  tenantId?: TenantId;
  incidentId?: IncidentId;
  runId?: RunId;
  from?: string;
  to?: string;
  limit: number;
}

export const validateStoreQuery = (input: StoreQuery): Result<NormalizedQuery, Error> => {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) return fail(new Error('query-invalid'));
  return ok({
    tenantId: parsed.data.tenantId ? (parsed.data.tenantId as TenantId) : undefined,
    incidentId: parsed.data.incidentId ? (parsed.data.incidentId as IncidentId) : undefined,
    runId: parsed.data.runId ? (parsed.data.runId as RunId) : undefined,
    from: parsed.data.from,
    to: parsed.data.to,
    limit: parsed.data.limit ?? 100,
  });
};
