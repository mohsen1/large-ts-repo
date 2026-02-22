import { RunQuery, RunRow } from './models';

export interface Cursor {
  offset: number;
  pageSize: number;
}

export const parseCursor = (value?: string): Cursor => {
  if (!value) return { offset: 0, pageSize: 50 };
  const [rawOffset, rawSize] = value.split(':');
  const offset = Number(rawOffset);
  const pageSize = Number(rawSize);
  return {
    offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 50,
  };
};

export const buildCursor = (cursor: Cursor): string => `${cursor.offset}:${cursor.pageSize}`;

export const filterRows = (rows: readonly RunRow[], query: RunQuery): readonly RunRow[] => {
  const fromMs = query.from ? Date.parse(query.from) : NaN;
  const toMs = query.to ? Date.parse(query.to) : NaN;

  return rows.filter((row) => {
    if (query.tenantId && row.tenantId !== query.tenantId) return false;
    if (query.status && row.run.status !== query.status) return false;

    const createdAt = Date.parse(row.run.createdAt);
    if (Number.isFinite(createdAt)) {
      if (Number.isFinite(fromMs) && createdAt < fromMs) return false;
      if (Number.isFinite(toMs) && createdAt > toMs) return false;
    }
    return true;
  });
};

export const paginate = <T>(rows: readonly T[], cursor: Cursor): readonly T[] => {
  return rows.slice(cursor.offset, cursor.offset + cursor.pageSize);
};
