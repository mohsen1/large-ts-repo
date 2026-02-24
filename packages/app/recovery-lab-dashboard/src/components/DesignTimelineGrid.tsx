import { useMemo } from 'react';
import type { LabExecution, LabLane } from '@domain/recovery-simulation-lab-core';

interface DesignTimelineGridProps {
  readonly executions: readonly LabExecution[];
  readonly lane: LabLane;
  readonly onSelect: (executionId: string) => void;
}

interface TimelineEvent {
  readonly executionId: string;
  readonly startedAt: string;
  readonly lane: LabLane;
  readonly pluginCount: number;
}

export const DesignTimelineGrid = ({ executions, lane, onSelect }: DesignTimelineGridProps) => {
  const rows = useMemo(() => {
    return executions
      .filter((execution) => (execution.lane === lane ? true : execution.pluginIds.length % 2 === 0))
      .map((execution) => {
        const score = Math.max(1, execution.pluginIds.length) / Math.max(1, execution.startedAt.length);
        return {
          executionId: execution.executionId,
          startedAt: execution.startedAt,
          lane: execution.lane,
          pluginCount: execution.pluginIds.length,
          score,
        } satisfies TimelineEvent & { readonly score: number };
      });
  }, [executions, lane]);

  return (
    <section style={{ border: '1px solid #d8d8d8', padding: 8, borderRadius: 6 }}>
      <h3>Execution timeline · {lane}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.toSorted((left, right) => right.score - left.score).map((row) => (
        <article
          key={row.executionId}
          onClick={() => onSelect(row.executionId)}
          style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}
        >
            <div>{row.executionId}</div>
            <div>{row.startedAt}</div>
            <div>{row.lane}</div>
            <strong>{row.pluginCount}</strong>
          </article>
        ))}
      </div>
      <p>total={rows.length}</p>
    </section>
  );
};
