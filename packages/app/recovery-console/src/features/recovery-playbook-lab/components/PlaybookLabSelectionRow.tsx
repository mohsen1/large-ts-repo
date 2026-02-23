import type { PlaybookSelectionRow } from '../types';

export interface PlaybookLabSelectionRowProps {
  readonly rows: readonly PlaybookSelectionRow[];
}

export const PlaybookLabSelectionRow = ({ rows }: PlaybookLabSelectionRowProps) => {
  const sortedRows = [...rows].sort((a, b) => b.score - a.score);
  const top = sortedRows.slice(0, 8);
  if (top.length === 0) {
    return (
      <section>
        <h3>Top selection rows</h3>
        <p>No playbooks available</p>
      </section>
    );
  }
  return (
    <section>
      <h3>Top selection rows</h3>
      <ul>
        {top.map((row) => (
          <li key={row.playbookId}>
            <strong>{row.title}</strong>
            <span> · score {row.score.toFixed(2)}</span>
            <span> · steps {row.expectedMinutes}m</span>
            <span> · status {row.status}</span>
            <div>
              {row.reasons.map((reason) => (
                <small key={reason} style={{ marginRight: '0.35rem' }}>
                  {reason}
                </small>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
