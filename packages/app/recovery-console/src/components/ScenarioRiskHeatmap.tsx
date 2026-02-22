import { useMemo } from 'react';

import type { RunDiagnostics } from '@service/recovery-runner';

interface ScenarioRiskHeatmapProps {
  readonly diagnostics?: RunDiagnostics;
}

const severityByScore = (score: number): string => {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

export const ScenarioRiskHeatmap = ({ diagnostics }: ScenarioRiskHeatmapProps) => {
  const points = useMemo(() => {
    const violations = diagnostics?.health.violations?.map((item) => item) ?? [];
    const baseline = violations.map((item) => ({ metric: 'violation', score: 1, state: item }));
    return baseline.length ? baseline : [{ metric: 'score', score: diagnostics?.health.score ?? 0, state: 'idle' }];
  }, [diagnostics]);

  return (
    <div className="risk-heatmap">
      <h3>Simulation risk heatmap</h3>
      <div className="heatmap-grid">
        {points.map((point, index) => (
          <div
            key={`${point.metric}-${index}`}
            className={`cell ${severityByScore(Number(point.score) * 1)}`}
          >
            <strong>{point.metric}</strong>
            <span>{String(point.state)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
