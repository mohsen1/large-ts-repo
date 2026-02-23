import { useMemo } from 'react';
import { ReadinessRunRow } from '../../hooks/useReadinessConsole';

interface ReadinessSignalBoardProps {
  runs: readonly ReadinessRunRow[];
  selectedRunId: string;
  onSelect: (runId: string) => void;
}

const RiskBadge = ({ risk }: { risk: string }) => {
  const level = useMemo(() => {
    if (risk === 'critical' || risk === 'red') {
      return '🛑 critical';
    }
    if (risk === 'high' || risk === 'amber') {
      return '⚠️ elevated';
    }
    if (risk === 'medium') {
      return 'ℹ️ medium';
    }
    return '✅ low';
  }, [risk]);

  return <span>{level}</span>;
};

export const ReadinessSignalBoard = ({ runs, selectedRunId, onSelect }: ReadinessSignalBoardProps) => {
  const list = useMemo(() => {
    return runs
      .slice()
      .sort((left, right) => right.summary.length - left.summary.length)
      .map((run) => ({
        ...run,
        selected: run.runId === selectedRunId,
      }));
  }, [runs, selectedRunId]);

  return (
    <section className="readiness-signal-board">
      <h3>Run Signals</h3>
      <div className="signal-board-grid">
        {list.map((run) => (
          <article
            key={run.runId}
            className={run.selected ? 'signal-board-item selected' : 'signal-board-item'}
            onClick={() => {
              onSelect(run.runId);
            }}
            role="button"
            tabIndex={0}
            aria-label={`select-${run.runId}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSelect(run.runId);
              }
            }}
          >
            <h4>{run.runId}</h4>
            <p>owner: {run.owner}</p>
            <p>state: {run.state}</p>
            <p>
              risk: <RiskBadge risk={run.riskBand} />
            </p>
            <p>summary: {run.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

