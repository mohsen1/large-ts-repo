import { useMemo } from 'react';

export interface IncidentTrendRow {
  readonly windowStart: string;
  readonly projectedMagnitude: number;
  readonly risk: string;
}

interface IncidentTrendBoardProps {
  readonly tenantId: string;
  readonly rows: readonly IncidentTrendRow[];
}

export const IncidentTrendBoard = ({ tenantId, rows }: IncidentTrendBoardProps) => {
  const normalized = useMemo(
    () => rows.map((row) => ({
      ...row,
      score: Math.max(0, Math.min(1, Number(row.projectedMagnitude))),
      title: row.windowStart.replace('T', ' ').slice(0, 16),
    })),
    [rows],
  );

  const maxScore = useMemo(
    () => normalized.reduce((max, row) => Math.max(max, row.score), 0),
    [normalized],
  );
  const riskSummary = useMemo(() => ({
    critical: normalized.filter((row) => row.risk === 'critical').length,
    high: normalized.filter((row) => row.risk === 'high').length,
    moderate: normalized.filter((row) => row.risk === 'moderate').length,
    low: normalized.filter((row) => row.risk === 'low').length,
  }), [normalized]);

  return (
    <section className="incident-trend-board">
      <h3>Forecast Trend · {tenantId}</h3>
      <p>{`Projected windows: ${normalized.length} • highest expected severity: ${maxScore.toFixed(2)}`}</p>
      <div className="incident-trend-summary">
        <span>{`Critical: ${riskSummary.critical}`}</span>
        <span>{`High: ${riskSummary.high}`}</span>
        <span>{`Moderate: ${riskSummary.moderate}`}</span>
        <span>{`Low: ${riskSummary.low}`}</span>
      </div>
      <ol>
        {normalized.map((entry) => {
          const width = `${Math.max(4, Math.round(entry.score * 100))}%`;
          return (
            <li key={entry.windowStart} className={`trend-row trend-${entry.risk}`}>
              <div>
                <strong>{entry.title}</strong>
                <span>{entry.risk}</span>
              </div>
              <div className="trend-bar" style={{ width }}>
                <span>{entry.score.toFixed(2)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
