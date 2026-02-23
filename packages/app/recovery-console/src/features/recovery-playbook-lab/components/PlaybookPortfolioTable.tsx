import type { PlaybookSelectionRow } from '../types';

export interface PlaybookPortfolioTableProps {
  readonly rows: readonly PlaybookSelectionRow[];
}

export const PlaybookPortfolioTable = ({ rows }: PlaybookPortfolioTableProps) => {
  const columns = ['title', 'status', 'score', 'minutes', 'reasons'];
  return (
    <section>
      <h3>Playbook portfolio</h3>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((playbook) => (
            <tr key={playbook.playbookId}>
              <td>{playbook.title}</td>
              <td>{playbook.status}</td>
              <td>{playbook.score.toFixed(2)}</td>
              <td>{playbook.expectedMinutes}</td>
              <td>{playbook.reasons.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
