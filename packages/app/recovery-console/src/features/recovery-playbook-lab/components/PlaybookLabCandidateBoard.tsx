import { useMemo } from 'react';
import type { PlaybookSelectionRow, PlaybookLabRouteState } from '../types';

interface PlaybookLabCandidateBoardProps {
  readonly rows: readonly PlaybookSelectionRow[];
  readonly route: PlaybookLabRouteState;
  readonly onRun: (playbookId: string) => void;
}

const scoreClass = (score: number): string => {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'mid';
  return 'low';
};

const rowLabel = (row: PlaybookSelectionRow): string =>
  `${row.title.substring(0, 30)}${row.title.length > 30 ? '…' : ''}`;

const reasonsList = (row: PlaybookSelectionRow): string =>
  row.reasons.length > 0 ? row.reasons.join(', ') : 'no reasons';

export const PlaybookLabCandidateBoard = ({ rows, onRun, route }: PlaybookLabCandidateBoardProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, PlaybookSelectionRow[]>();
    for (const row of rows) {
      const bucket = map.get(route.lens) ?? [];
      bucket.push(row);
      map.set(route.lens, bucket);
    }
    return map;
  }, [route.lens, rows]);

  return (
    <section className="playbook-lab-candidate-board">
      <h4>Candidates</h4>
      {[...grouped.entries()].map(([lane, candidates]) => (
        <div key={lane} className="candidate-lane">
          <h5>{lane}</h5>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Score</th>
                <th>Minutes</th>
                <th>Status</th>
                <th>Reasons</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.playbookId}>
                  <td>{rowLabel(row)}</td>
                  <td className={scoreClass(row.score)}>{row.score.toFixed(3)}</td>
                  <td>{row.expectedMinutes}</td>
                  <td>{row.status}</td>
                  <td>{reasonsList(row)}</td>
                  <td>
                    <button type="button" onClick={() => onRun(row.playbookId as string)}>
                      run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
};
