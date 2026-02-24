import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabRuntimeEvent } from '@domain/recovery-lab-console-core';

interface LiveCursor {
  readonly cursor: number;
}

export interface UseLabEventStreamInput {
  readonly events: readonly LabRuntimeEvent[];
  readonly pageSize?: number;
}

export interface UseLabEventStreamReturn {
  readonly filtered: readonly LabRuntimeEvent[];
  readonly hasMore: boolean;
  readonly offset: number;
  readonly streamByPhase: Record<string, readonly LabRuntimeEvent[]>;
  readonly loadMore: () => void;
  readonly reset: () => void;
}

const phaseOf = (event: LabRuntimeEvent): string => {
  if (event.kind === 'plugin.started' || event.kind === 'plugin.completed' || event.kind === 'plugin.failed') {
    return event.stage;
  }
  return event.kind;
};

const stableKey = (event: LabRuntimeEvent, index: number): string => {
  if (event.kind === 'run.complete') {
    return `${index}:${event.runId}`;
  }

  if (event.kind === 'plugin.failed') {
    return `${index}:${event.pluginId}:fail`;
  }

  return `${index}:${event.pluginId}`;
};

export const useLabEventStream = ({ events, pageSize = 15 }: UseLabEventStreamInput): UseLabEventStreamReturn => {
  const cursorRef = useRef<LiveCursor>({ cursor: pageSize });
  const [filtered, setFiltered] = useState<readonly LabRuntimeEvent[]>([]);
  const [offset, setOffset] = useState(pageSize);

  const buildBuckets = useCallback((history: readonly LabRuntimeEvent[]) => {
    const buckets = new Map<string, LabRuntimeEvent[]>();
    for (const event of history) {
      const phase = phaseOf(event);
      const current = buckets.get(phase) ?? [];
      buckets.set(phase, [...current, event]);
    }
    return Object.fromEntries([...buckets.entries()].map(([key, list]) => [key, [...list]])) as Record<string, readonly LabRuntimeEvent[]>;
  }, []);

  const update = useCallback(
    (history: readonly LabRuntimeEvent[], nextOffset: number) => {
      const next = history.slice(0, nextOffset).map((event) => event);
      setFiltered(next);
      setOffset(nextOffset);
      cursorRef.current = { cursor: nextOffset };
      return next;
    },
    [],
  );

  useEffect(() => {
    const nextOffset = Math.min(events.length, cursorRef.current.cursor);
    const next = update(events, nextOffset);
    setFiltered(
      next.toSorted((left, right) => {
        const leftAt = 'startedAt' in left ? left.startedAt : new Date().toISOString();
        const rightAt = 'startedAt' in right ? right.startedAt : new Date().toISOString();
        return leftAt.localeCompare(rightAt);
      }),
    );
  }, [events, update]);

  const loadMore = useCallback(() => {
    const nextOffset = Math.min(events.length, offset + pageSize);
    const next = update(events, nextOffset);
    setFiltered(
      next.toSorted((left, right) => {
        if (left.kind === 'run.complete' && right.kind === 'run.complete') {
          return 0;
        }
        return left.kind.localeCompare(right.kind);
      }),
    );
  }, [events, offset, pageSize, update]);

  const reset = useCallback(() => {
    update(events, pageSize);
  }, [events, pageSize, update]);

  return {
    filtered: [...filtered],
    hasMore: filtered.length < events.length,
    offset,
    streamByPhase: buildBuckets(filtered),
    loadMore,
    reset,
  };
};
