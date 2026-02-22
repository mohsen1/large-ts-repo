export interface QueryContext {
  tenantId: string;
  userId: string;
  roles: readonly string[];
}

export interface QueryRequest<TFilter> {
  filter: TFilter;
  cursor?: string;
  limit?: number;
  sortBy?: keyof TFilter | string;
  direction?: 'asc' | 'desc';
}

export interface QueryResult<TEntity> {
  cursor?: string;
  items: TEntity[];
  hasMore: boolean;
}

export const buildCursor = (index: number, pageSize: number): string => {
  return `${index}:${pageSize}:${Date.now()}`;
};

export const parseCursor = (cursor?: string): { index: number; pageSize: number } => {
  if (!cursor) return { index: 0, pageSize: 50 };
  const [i, p] = cursor.split(':');
  return { index: Number(i) || 0, pageSize: Number(p) || 50 };
};

export const clampLimit = (limit?: number): number => {
  if (!limit || !Number.isFinite(limit)) return 50;
  if (limit < 1) return 1;
  if (limit > 5000) return 5000;
  return Math.floor(limit);
};
