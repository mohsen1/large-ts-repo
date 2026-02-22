import { useMemo } from 'react';
import type { ReadinessRunId } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';

interface WorkloadRow {
  readonly runId: ReadinessRunId;
  readonly owner: string;
  readonly signalDensity: number;
  readonly directiveCount: number;
  readonly riskBand: 'green' | 'amber' | 'red';
  readonly warning: boolean;
}

interface ReadinessReadinessWorkloadTableProps {
  readonly rows: readonly ReadinessReadModel[];
  readonly selectedRunId?: ReadinessRunId;
  readonly onRowSelect?: (runId: ReadinessRunId) => void;
}

export const ReadinessReadinessWorkloadTable = ({
  rows,
  selectedRunId,
  onRowSelect,
}: ReadinessReadinessWorkloadTableProps) => {
  const transformed = useMemo<readonly WorkloadRow[]>(() => {
    return rows.map((row) => {
      const denominator = Math.max(1, row.targets.length);
      const signalDensity = row.signals.length / denominator;
      return {
        runId: row.plan.runId,
        owner: row.plan.metadata.owner,
        signalDensity: Number(signalDensity.toFixed(2)),
        directiveCount: row.directives.length,
        riskBand: row.plan.riskBand,
        warning: signalDensity > 8 || row.directives.some((directive) => !directive.enabled),
      };
    });
  }, [rows]);

  const selectedStyle = (runId: ReadinessRunId) => (selectedRunId === runId ? { fontWeight: 'bold' } : undefined);
  const maxDensity = useMemo(() => Math.max(1, ...transformed.map((entry) => entry.signalDensity)), [transformed]);
  const avgDensity = useMemo(
    () => (transformed.length ? transformed.reduce((sum, entry) => sum + entry.signalDensity, 0) / transformed.length : 0),
    [transformed],
  );

  return (
    <section>
      <h2>Readiness Workload</h2>
      <p>{`avg density: ${avgDensity.toFixed(2)} max: ${maxDensity.toFixed(2)}`}</p>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Owner</th>
            <th>Signal Density</th>
            <th>Directives</th>
            <th>Risk</th>
            <th>Warning</th>
          </tr>
        </thead>
        <tbody>
          {transformed.map((entry) => (
            <tr
              key={entry.runId}
              style={selectedStyle(entry.runId)}
              onClick={() => onRowSelect?.(entry.runId)}
            >
              <td>{entry.runId}</td>
              <td>{entry.owner}</td>
              <td>{entry.signalDensity.toFixed(2)}</td>
              <td>{entry.directiveCount}</td>
              <td>{entry.riskBand}</td>
              <td>{entry.warning ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

