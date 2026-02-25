import type { ReactElement } from 'react';
import type { ChronicleStatus } from '@shared/chronicle-orchestration-protocol';

interface MetricRow {
  readonly axis: string;
  readonly score: number;
  readonly trend: 'up' | 'down' | 'flat';
}

interface ChronicleLabMetricsProps {
  readonly axisRows: readonly MetricRow[];
  readonly status: ChronicleStatus;
  readonly summary: string;
  readonly onAxisSelected?: (axis: string) => void;
}

export const ChronicleLabMetrics = ({ axisRows, status, summary, onAxisSelected }: ChronicleLabMetricsProps): ReactElement => {
  const sorted = [...axisRows].toSorted((left, right) => right.score - left.score);

  return (
    <section>
      <h2>Lab Metrics</h2>
      <p>{summary}</p>
      <table>
        <thead>
          <tr>
            <th>Axis</th>
            <th>Score</th>
            <th>Trend</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const color =
              status === 'failed'
                ? 'tomato'
                : row.trend === 'up'
                  ? 'darkgreen'
                  : row.trend === 'down'
                    ? 'darkred'
                    : 'black';

            return (
              <tr key={row.axis}>
                <td>{row.axis}</td>
                <td style={{ color }}>{row.score}</td>
                <td>{row.trend}</td>
                <td>
                  <button type="button" onClick={() => onAxisSelected?.(row.axis)}>
                    Inspect
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
