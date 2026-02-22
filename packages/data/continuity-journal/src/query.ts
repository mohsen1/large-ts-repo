import { ContinuityRunRow } from './models';

const decodeCursor = (cursor?: string): number => {
  if (!cursor) return 0;
  const index = Number.parseInt(cursor, 10);
  return Number.isFinite(index) && index >= 0 ? index : 0;
}

const encodeCursor = (cursor: number): string => `cursor:${cursor}`;

export const paginate = <T extends ContinuityRunRow>(
  records: readonly T[],
  cursor?: string,
  limit = 100,
): readonly T[] => {
  const start = decodeCursor(cursor);
  const end = Math.min(start + limit, records.length);
  return records.slice(start, end);
};

export const pageCursor = (records: readonly ContinuityRunRow[], limit: number, cursor?: string): string | undefined => {
  const start = decodeCursor(cursor);
  const end = Math.min(start + limit, records.length);
  if (end >= records.length) return undefined;
  return encodeCursor(end);
};

export const countByState = (records: readonly ContinuityRunRow[]): Record<string, number> =>
  records.reduce<Record<string, number>>((acc, item) => {
    const key = item.envelope.state;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
