import { useMemo } from 'react';
import type { TenantCoordinationBoard } from '@domain/recovery-operations-models/coordination-metrics';

export interface OperationsDependencyPanelProps {
  readonly board: TenantCoordinationBoard;
  readonly tenant: string;
  readonly onRefresh?: () => void;
}

const renderMetric = (
  _label: string,
  list: readonly { readonly runId: string; readonly summary: string }[],
) => (
  <ul>
    {list.map((entry) => (
      <li key={entry.runId}>
        {entry.runId}: {entry.summary}
      </li>
    ))}
  </ul>
);

export const OperationsDependencyPanel = ({ board, tenant, onRefresh }: OperationsDependencyPanelProps) => {
  const metrics = useMemo(() => {
    const active: { runId: string; summary: string }[] = board.active.map((entry) => ({
      runId: String(entry.runId),
      summary: `active ${entry.summary}`,
    }));
    const blocked: { runId: string; summary: string }[] = board.blocked.map((entry) => ({
      runId: String(entry.runId),
      summary: `blocked ${entry.summary}`,
    }));
    const completed: { runId: string; summary: string }[] = board.completed.map((entry) => ({
      runId: String(entry.runId),
      summary: `completed ${entry.summary}`,
    }));

    return [...active, ...blocked, ...completed];
  }, [board]);

  return (
    <section>
      <header>
        <h3>Operations dependency board ({tenant})</h3>
        <button onClick={() => onRefresh?.()}>Refresh board</button>
      </header>
      <p>
        active={board.active.length} blocked={board.blocked.length} completed={board.completed.length}
      </p>
      {renderMetric('runs', metrics)}
    </section>
  );
};
