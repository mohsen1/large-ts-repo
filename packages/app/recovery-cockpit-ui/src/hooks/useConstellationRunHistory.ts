import { useCallback, useMemo, useState } from 'react';
import type { OrchestratorRuntime } from '@service/recovery-cockpit-constellation-orchestrator';

type SortDirection = 'asc' | 'desc';

type RunHistoryOptions = {
  readonly limit?: number;
  readonly direction?: SortDirection;
};

export const useConstellationRunHistory = (history: ReadonlyArray<OrchestratorRuntime>, options: RunHistoryOptions = {}) => {
  const [search, setSearch] = useState('');
  const direction = options.direction ?? 'desc';
  const limit = options.limit ?? 10;
  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const base = history.filter((entry) => {
      const planId = entry.snapshot?.planId ?? '';
      const runId = entry.snapshot?.runId ?? '';
      return query.length === 0 || planId.toLowerCase().includes(query) || runId.toLowerCase().includes(query);
    });
    const byDate = base.toSorted((left, right) => {
      const leftAt = Number(new Date(left.response.startedAt));
      const rightAt = Number(new Date(right.response.startedAt));
      return direction === 'asc' ? leftAt - rightAt : rightAt - leftAt;
    });
    return byDate.slice(0, limit);
  }, [direction, history, limit, query]);

  const clear = useCallback(() => setSearch(''), []);
  const setFilter = useCallback((next: string) => setSearch(next), []);

  return {
    search,
    results: filtered,
    setFilter,
    clear,
    count: filtered.length,
  };
};
