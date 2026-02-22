import type { ContinuityWorkspace } from '@domain/continuity-lens';
import { useMemo } from 'react';

interface ContinuityLensRiskBoardProps {
  readonly workspace?: ContinuityWorkspace;
  readonly onForecast: (minutes: number) => Promise<void>;
}

const toRiskClass = (riskScore: number): string => {
  if (riskScore >= 80) return 'critical';
  if (riskScore >= 60) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
};

export const ContinuityLensRiskBoard = ({ workspace, onForecast }: ContinuityLensRiskBoardProps) => {
  const trendPoints = useMemo(
    () =>
      [
        5, 12, 22, 18, 25, 33, 40, 42, 55, 61, 57, 70,
      ].map((value, index) => `${index * 5}:${value}`),
    [],
  );

  const currentRisk = workspace?.snapshot.riskScore ?? 0;
  const riskClass = toRiskClass(currentRisk);

  return (
    <section>
      <h2>Risk board</h2>
      <div>
        <p>Current risk class: <strong>{riskClass}</strong></p>
        <p>Risk score: <strong>{currentRisk.toFixed(2)}</strong></p>
      </div>
      <p>Trend samples: {trendPoints.length}</p>
      <ul>
        {trendPoints.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      <div className="risk-actions">
        <button type="button" onClick={() => void onForecast(30)}>
          Forecast 30m
        </button>
        <button type="button" onClick={() => void onForecast(120)}>
          Forecast 2h
        </button>
      </div>
    </section>
  );
};
