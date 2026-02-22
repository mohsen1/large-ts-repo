import { z } from 'zod';
import { normalizeIncomingSignal, normalizeIncomingPlan } from './records';
import { Brand } from '@shared/core';

const QuerySchema = z.object({
  tenantId: z.string().min(3),
  shape: z.enum(['latency', 'error-rate', 'availability', 'capacity', 'security']).optional(),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

type RawStoreQuery = z.infer<typeof QuerySchema>;

export interface StoreQuery extends Omit<RawStoreQuery, 'from' | 'to' | 'limit'> {
  tenantId: Brand<string, 'TenantId'>;
  from: number;
  to: number;
  limit: number;
}

export const parseQuery = (raw: unknown): StoreQuery | undefined => {
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return;
  return {
    ...parsed.data,
    tenantId: parsed.data.tenantId as Brand<string, 'TenantId'>,
    from: parsed.data.from ?? 0,
    to: parsed.data.to ?? Date.now(),
    limit: parsed.data.limit ?? 100,
  };
};

export const parseSignal = (raw: unknown) => normalizeIncomingSignal(raw);
export const parsePlan = (raw: unknown) => normalizeIncomingPlan(raw);
