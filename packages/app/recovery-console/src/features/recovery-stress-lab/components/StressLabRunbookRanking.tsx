import { useMemo } from 'react';
import { CommandRunbook, WorkloadTopology } from '@domain/recovery-stress-lab';

interface Props {
  readonly ranking: readonly { id: CommandRunbook['id']; score: number }[];
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology | null;
}

interface Row {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly isCritical: boolean;
}

const formatScore = (score: number): string => {
  if (score <= 0) return 'n/a';
  return `${score} pts`;
};

export const StressLabRunbookRanking = ({ ranking, runbooks, topology }: Props) => {
  const criticalWorkloads = useMemo(() => new Set<string>((topology?.nodes ?? []).map((node) => node.id)), [topology]);

  const rows = useMemo(() => {
    return ranking
      .map<Row>((entry) => {
        const runbook = runbooks.find((candidate) => candidate.id === entry.id);
        return {
          id: entry.id,
          name: runbook?.name ?? String(entry.id),
          score: entry.score,
          isCritical: runbook ? criticalWorkloads.has(String(runbook.id)) : false,
        };
      })
      .sort((left, right) => right.score - left.score);
  }, [ranking, runbooks, criticalWorkloads]);

  if (rows.length === 0) {
    return <p>No ranked runbooks yet.</p>;
  }

  return (
    <section>
      <h2>Runbook Readiness Ranking</h2>
      <table>
        <thead>
          <tr>
            <th>Runbook</th>
            <th>Score</th>
            <th>Critical Workload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{formatScore(row.score)}</td>
              <td>{row.isCritical ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
