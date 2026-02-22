import { useMemo } from 'react';

import { useRecoveryDrillCatalog } from '../hooks/useRecoveryDrillCatalog';

interface RecoveryDrillRunBoardProps {
  readonly tenant: string;
}

export const RecoveryDrillRunBoard = ({ tenant }: RecoveryDrillRunBoardProps) => {
  const { metrics, starts } = useRecoveryDrillCatalog({ tenant });

  const averageSuccess = useMemo(() => {
    const sum = metrics.reduce((acc, item) => acc + item.averageSuccess, 0);
    return metrics.length === 0 ? 0 : (sum / metrics.length).toFixed(4);
  }, [metrics]);

  return (
    <section className="drill-run-board">
      <header>
        <h3>Recovery Drill Run Board</h3>
      </header>
      <p>Template count: {metrics.length}</p>
      <p>Average success: {averageSuccess}</p>
      <ul>
        {metrics.map((item) => (
          <li key={item.templateId}>
            <span>{item.templateId}</span>
            <span>runs:{item.runCount}</span>
            <span>avg:{item.averageSuccess.toFixed(4)}</span>
            <span>trend:{item.trend}</span>
          </li>
        ))}
      </ul>
      <div>
        <h4>Run events</h4>
        <ol>
          {starts.map((event) => (
            <li key={`${event.runId}-${event.status}`}>
              {event.runId}: {event.status}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
