import { useMemo } from 'react';
import type { PluginOrchestratorState } from '../hooks/useRecoveryLabPluginOrchestrator';
import type { PluginExecutionStep } from '@service/recovery-stress-lab-orchestrator';

export interface RecoveryLabPluginPolicyMatrixProps {
  readonly state: PluginOrchestratorState;
}

const toScore = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const RecoveryLabPluginPolicyMatrix = ({ state }: RecoveryLabPluginPolicyMatrixProps) => {
  const rows = useMemo(
    () =>
      state.reports.flatMap((report) =>
        report.steps.map((step: PluginExecutionStep<unknown, unknown>) => ({
          manifestId: step.manifestId,
          stage: step.stage,
          kind: step.manifestKind,
          status: step.ok ? 'ok' : 'fail',
          start: step.startedAt,
          finish: step.finishedAt ?? '-',
          score: toScore((String(step.input).length + (step.output ? String(step.output).length : 0)) / 3),
        })),
      ),
    [state.reports],
  );

  if (!rows.length) {
    return (
      <section className="recovery-lab-plugin-policy-matrix">
        <h3>Policy Matrix</h3>
        <p>No execution records yet.</p>
      </section>
    );
  }

  return (
    <section className="recovery-lab-plugin-policy-matrix">
      <h3>Policy Matrix</h3>
      <table>
        <thead>
          <tr>
            <th>Manifest</th>
            <th>Kind</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Started</th>
            <th>Finished</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.manifestId}-${row.stage}-${row.start}`}>
              <td>{String(row.manifestId)}</td>
              <td>{row.kind}</td>
              <td>{row.stage}</td>
              <td>{row.status}</td>
              <td>{row.start}</td>
              <td>{row.finish}</td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
