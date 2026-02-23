import { useMemo } from 'react';
import { inferInsights } from '@service/recovery-drill-lab-orchestrator';
import type { DrillRunSnapshot } from '@domain/recovery-drill-lab';

interface Props {
  readonly snapshots: readonly DrillRunSnapshot[];
}

const suggestionColor = (suggestion: string): string => {
  if (suggestion.includes('improving')) {
    return '#22c55e';
  }
  if (suggestion.includes('urgent')) {
    return '#ef4444';
  }
  return '#f59e0b';
};

export const RunHealthMatrix = ({ snapshots }: Props) => {
  const rows = useMemo(
    () =>
      snapshots.map((snapshot) => {
        const insight = inferInsights(snapshot);
        return {
          id: snapshot.id,
          status: snapshot.status,
          suggestion: insight.suggestion,
          trend: insight.trend,
          frames: insight.frames.length,
        };
      }),
    [snapshots],
  );

  return (
    <section>
      <h4>Health matrix</h4>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Status</th>
            <th>Frames</th>
            <th>Trend</th>
            <th>Suggestion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.status}</td>
              <td>{row.frames}</td>
              <td>{row.trend}</td>
              <td style={{ color: suggestionColor(row.suggestion) }}>{row.suggestion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
