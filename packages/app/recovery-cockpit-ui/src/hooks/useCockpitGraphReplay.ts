import { useCallback, useMemo, useState } from 'react';
import type { GraphOrchestrationEvent } from '../services/recoveryCockpitGraphService';

export interface ReplayChunk {
  readonly cursor: number;
  readonly events: readonly GraphOrchestrationEvent[];
  readonly done: boolean;
}

export const useCockpitGraphReplay = (events: readonly GraphOrchestrationEvent[]) => {
  const [cursor, setCursor] = useState(0);

  const chunks = useMemo(() => {
    const windows: ReplayChunk[] = [];
    const page = 4;
    for (let index = 0; index < events.length; index += page) {
      windows.push({
        cursor: index,
        events: events.slice(index, index + page),
        done: index + page >= events.length,
      });
    }
    return windows;
  }, [events]);

  const step = useCallback(
    (advance: number) =>
      setCursor((current) => {
        const next = current + advance;
        if (next <= 0) {
          return 0;
        }
        if (next >= events.length) {
          return events.length;
        }
        return next;
      }),
    [events.length],
  );

  return {
    cursor,
    step,
    replay: chunks,
    visibleEvents: events.slice(0, cursor),
    complete: cursor >= events.length,
  };
};
