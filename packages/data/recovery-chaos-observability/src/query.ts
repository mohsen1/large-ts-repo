import type { StageBoundary } from '@domain/recovery-chaos-lab';
import type { ChaosRunEnvelope, QueryCursor } from './models';

export interface RunQuery<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace?: string;
  readonly scenarioId?: string;
  readonly includeArchived?: boolean;
  readonly statuses?: readonly string[];
  readonly stageFilter?: readonly TStages[number]['name'][];
}

export interface RunCursor extends QueryCursor {
  readonly pageSize: number;
}

export type PageWindow = {
  readonly offset: number;
  readonly pageSize: number;
};

const defaultCursor: PageWindow = { offset: 0, pageSize: 50 };

function normalizeOffset(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : defaultCursor.offset;
}

function normalizePageSize(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return defaultCursor.pageSize;
  }
  if (value > 500) return 500;
  return Math.floor(value);
}

function isStateActive(state: string, includeArchived: boolean | undefined): boolean {
  return includeArchived ? true : state !== 'archived' && state !== 'drained';
}

export function buildCursor(overrides: Partial<PageWindow> = {}): RunCursor {
  const pageSize = normalizePageSize(overrides.pageSize);
  return {
    namespace: '',
    scenarioId: '',
    state: 'active',
    offset: normalizeOffset(overrides.offset),
    pageSize
  };
}

export function filterRows<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<TStages>[],
  query: RunQuery<TStages>
): readonly ChaosRunEnvelope<TStages>[] {
  return rows.filter((row) => {
    if (query.namespace && row.namespace !== query.namespace) return false;
    if (query.scenarioId && row.scenarioId !== query.scenarioId) return false;
    if (!isStateActive(row.state, query.includeArchived)) return false;
    if (query.statuses && query.statuses.length > 0 && !query.statuses.includes(row.status)) return false;
    if (query.stageFilter && query.stageFilter.length > 0) {
      const known = new Set<TStages[number]['name']>(row.stages.map((stage) => stage.name));
      if (!query.stageFilter.every((name) => known.has(name))) return false;
    }
    return true;
  });
}

export function sortRows<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<TStages>[]
): readonly ChaosRunEnvelope<TStages>[] {
  return [...rows].sort((left, right) => {
    const l = Number(left.snapshot.metrics['throughput::ratio'] ?? 0);
    const r = Number(right.snapshot.metrics['throughput::ratio'] ?? 0);
    return r - l;
  });
}

export function pageRows<T>(
  rows: readonly T[],
  cursor: PageWindow
): readonly T[] {
  const at = normalizeOffset(cursor.offset);
  const size = normalizePageSize(cursor.pageSize);
  return rows.slice(at, at + size);
}

export function pickLatestRows<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<TStages>[],
  count = 20
): readonly ChaosRunEnvelope<TStages>[] {
  return sortRows(rows).slice(0, Math.max(1, Math.min(count, 250)));
}

export function toCursorLabel(page: RunCursor): string {
  return `${page.namespace}:${page.scenarioId}:${page.state}:${page.offset}:${page.pageSize}`;
}

export function pageResult<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<TStages>[],
  cursor: Partial<RunCursor> = {}
) {
  const window = {
    offset: normalizeOffset(cursor.offset),
    pageSize: normalizePageSize(cursor.pageSize)
  };
  const paged = pageRows(sortRows(rows), window);
  return {
    items: paged,
    hasMore: rows.length > window.offset + paged.length,
    cursor: toCursorLabel({ ...buildCursor(cursor), offset: window.offset + paged.length })
  };
}
