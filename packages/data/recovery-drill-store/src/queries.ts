import type { DrillRunRecord, DrillStoreQuery, DrillListResult, DrillTemplateRecord } from './models';

const inRange = (value: string, from?: string, to?: string): boolean => {
  const at = new Date(value).getTime();
  const min = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
  const max = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(at) && at >= min && at <= max;
};

export const matchesTemplateQuery = (query: DrillStoreQuery, template: DrillTemplateRecord): boolean =>
  (!query.templateIds || query.templateIds.includes(template.templateId)) &&
  template.template.tenantId === (query.tenant ?? template.template.tenantId);

export const matchesRunQuery = <T extends { status: string; startedAt?: string }>(
  query: Pick<DrillStoreQuery, 'status' | 'from' | 'to'>,
  item: T,
): boolean => {
  if (query.status && query.status.length > 0) {
    if (!query.status.includes(item.status as any)) return false;
  }
  if (item.startedAt) {
    return inRange(item.startedAt, query.from, query.to);
  }
  return true;
};

export const paginate = <T extends DrillRunRecord>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): DrillListResult & { items: readonly T[] } => {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const pageSize = Math.max(1, Math.min(500, Number.isFinite(limit) ? limit : 25));
  const end = Math.min(items.length, start + pageSize);
  return {
    items: items.slice(start, end),
    total: items.length,
    nextCursor: end < items.length ? String(end) : undefined,
  };
};

export const flattenTemplateKeys = (templates: readonly DrillTemplateRecord[]): string =>
  templates.map((item) => `${item.tenantId}:${item.templateId}`).join('\n');
