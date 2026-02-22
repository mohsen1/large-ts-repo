import { useMemo } from 'react';
import type { CommandNodeId } from '@domain/recovery-command-orchestration';
import type { CommandSynthesisResult } from '@service/recovery-fusion-orchestrator';

interface CommandDependencyMatrixProps {
  readonly graphId: string;
  readonly result?: CommandSynthesisResult;
  readonly criticalPaths: readonly CommandNodeId[];
} 

interface MatrixCell {
  readonly nodeId: CommandNodeId;
  readonly critical: boolean;
  readonly readyIndex: number;
}

const maxCellCount = 36;

export const CommandDependencyMatrix = ({ graphId, result, criticalPaths }: CommandDependencyMatrixProps) => {
  const columns = useMemo(() => {
    const pathIds = criticalPaths.slice(0, maxCellCount);
    return pathIds.map((nodeId, index): MatrixCell => ({
      nodeId,
      critical: index < 3 || index === pathIds.length - 1,
      readyIndex: index + 1,
    }));
  }, [criticalPaths]);

  const readiness = useMemo(() => {
    if (!result) return 0;
    if (result.forecastMinutes <= 0) return 0;
    return Math.max(0, Math.min(100, result.readinessScore + result.conflicts.length));
  }, [result]);

  return (
    <section className="command-dependency-matrix">
      <h3>Dependency matrix</h3>
      <p>Graph: {graphId}</p>
      <p>Readiness index: {readiness}</p>
      <table>
        <thead>
          <tr>
            <th>Index</th>
            <th>Wave</th>
            <th>Critical</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((cell) => (
              <tr key={String(cell.nodeId)}>
                <td>{cell.readyIndex}</td>
                <td>{cell.nodeId}</td>
                <td>{cell.critical ? 'critical' : 'normal'}</td>
                <td>{cell.readyIndex % 2 === 0 ? 'ready' : 'blocked'}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {!columns.length && <p>No critical path available</p>}
    </section>
  );
};
