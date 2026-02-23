import { useMemo } from 'react';

import { type StudioCommandBoardRow } from '../../services/commandStudioAdapter';
import { type CommandWindowState } from '@domain/recovery-command-studio';

const stateToClass = (state: CommandWindowState): string => {
  if (state === 'failed') return 'command-studio-row--failed';
  if (state === 'active') return 'command-studio-row--active';
  if (state === 'suspended') return 'command-studio-row--suspended';
  if (state === 'complete') return 'command-studio-row--complete';
  return 'command-studio-row--default';
};

interface CommandStudioPlanTableProps {
  readonly rows: readonly StudioCommandBoardRow[];
}

export const CommandStudioPlanTable = ({ rows }: CommandStudioPlanTableProps) => {
  const filtered = useMemo(() => rows.filter((row) => row.sequenceId.length > 0), [rows]);

  return (
    <section className="command-studio-plan-table">
      <h2>Plan dispatch queue</h2>
      <table>
        <thead>
          <tr>
            <th>Sequence</th>
            <th>State</th>
            <th>Estimate (m)</th>
            <th>Warnings</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.sequenceId} className={stateToClass(row.state)}>
              <td>{row.sequenceId}</td>
              <td>{row.state}</td>
              <td>{row.estimatedMinutes.toFixed(1)}</td>
              <td>{row.warningCount}</td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={4}>No active sequence planned</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
};
