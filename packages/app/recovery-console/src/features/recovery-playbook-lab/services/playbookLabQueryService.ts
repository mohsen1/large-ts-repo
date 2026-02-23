import {
  createRecoveryQueryFromContext,
} from '@domain/recovery-playbooks';
import type { RecoveryPlaybookContext, RecoveryPlaybookQuery } from '@domain/recovery-playbooks';
import { z } from 'zod';
import { withBrand } from '@shared/core';

export type QuerySource = 'manual' | 'seeded' | 'policy';

export interface QueryDescriptor {
  readonly source: QuerySource;
  readonly query: RecoveryPlaybookQuery;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export interface QueryExecutionPlan {
  readonly workspaceId: string;
  readonly descriptors: readonly QueryDescriptor[];
  readonly active: RecoveryPlaybookQuery;
  readonly limit: number;
}

const limitSchema = z.number().int().min(1).max(250).default(25);
const statusSchema = z.enum(['draft', 'published', 'deprecated', 'retired']).optional();

const QueryPlanSchema = z.object({
  source: z.enum(['manual', 'seeded', 'policy']),
  limit: limitSchema,
  tenantId: z.string().min(1),
  labels: z.array(z.string()).optional(),
  status: statusSchema,
});

export const parseQueryInput = (payload: unknown): RecoveryPlaybookQuery => {
  const raw = QueryPlanSchema.safeParse(payload);
  if (!raw.success) {
    return {
      tenantId: withBrand('tenant-alpha', 'TenantId'),
      status: 'published',
      limit: 25,
      labels: ['automated'],
    };
  }
  return {
    tenantId: withBrand(raw.data.tenantId, 'TenantId'),
    status: raw.data.status ?? 'published',
    labels: raw.data.labels,
    limit: raw.data.limit,
  };
};

export const buildQueryDescriptors = (
  context: RecoveryPlaybookContext,
  source: QuerySource,
): readonly QueryDescriptor[] => {
  const base = createRecoveryQueryFromContext(context);
  const fromContext = createRecoveryQueryFromContext(context);
  const now = new Date().toISOString();
  return [
    {
      source,
      query: {
        ...base,
        labels: [...(base.labels ?? []), 'primary'],
      },
      tags: ['context', 'primary', String(context.tenantId)],
      createdAt: now,
    },
    {
      source,
      query: {
        ...fromContext,
        labels: [...(fromContext.labels ?? []), 'policy'],
        limit: fromContext.limit ? Math.max(8, fromContext.limit) : 20,
      },
      tags: ['policy', 'derived'],
      createdAt: now,
    },
  ];
};

export const foldQueryDescriptors = (descriptors: readonly QueryDescriptor[]): QueryExecutionPlan => {
  const merged = descriptors.reduce<Record<string, QueryDescriptor>>((acc, descriptor) => {
    if (!acc[descriptor.source]) {
      acc[descriptor.source] = descriptor;
    }
    return acc;
  }, {});
  const all = Object.values(merged);
  const active = all.at(-1)?.query ?? {
    tenantId: withBrand('tenant-alpha', 'TenantId'),
    status: 'published',
    labels: ['automated'],
    limit: 25,
  };
  return {
    workspaceId: `workspace:${all.length}:${Date.now()}`,
    descriptors: all,
    active,
    limit: active.limit ?? 25,
  };
};

export const queryHasFilters = (query: RecoveryPlaybookQuery): boolean =>
  Boolean(query.labels?.length || query.categories?.length || query.serviceId || query.labels?.includes('high-priority'));

export const enrichQuery = (query: RecoveryPlaybookQuery, tag: string): RecoveryPlaybookQuery => ({
  ...query,
  labels: [...new Set([...(query.labels ?? []), tag, 'recovery'])],
});

export const mergeQueries = (left: RecoveryPlaybookQuery, right: RecoveryPlaybookQuery): RecoveryPlaybookQuery => ({
  tenantId: left.tenantId,
  status: right.status ?? left.status,
  labels: [...new Set([...(left.labels ?? []), ...(right.labels ?? [])])],
  categories: [...new Set([...(left.categories ?? []), ...(right.categories ?? [])])],
  severityBands: [...new Set([...(left.severityBands ?? []), ...(right.severityBands ?? [])])],
  serviceId: right.serviceId ?? left.serviceId,
  limit: Math.max(left.limit ?? 0, right.limit ?? 0),
});

export const diffQueries = (
  previous: RecoveryPlaybookQuery,
  next: RecoveryPlaybookQuery,
): readonly string[] => {
  const changed: string[] = [];
  if (previous.tenantId !== next.tenantId) changed.push('tenantId');
  if (previous.status !== next.status) changed.push('status');
  const prevLabels = new Set(previous.labels ?? []);
  const nextLabels = new Set(next.labels ?? []);
  if (prevLabels.size !== nextLabels.size || [...prevLabels].some((label) => !nextLabels.has(label))) changed.push('labels');
  const prevCats = new Set(previous.categories ?? []);
  const nextCats = new Set(next.categories ?? []);
  if (prevCats.size !== nextCats.size || [...prevCats].some((category) => !nextCats.has(category))) changed.push('categories');
  const prevSev = new Set(previous.severityBands ?? []);
  const nextSev = new Set(next.severityBands ?? []);
  if (prevSev.size !== nextSev.size || [...prevSev].some((severity) => !nextSev.has(severity))) changed.push('severityBands');
  return changed;
};
