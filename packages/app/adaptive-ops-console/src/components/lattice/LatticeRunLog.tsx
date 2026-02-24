import { type ReactElement } from 'react';

type Props = {
  readonly lines: readonly string[];
  readonly onClear: () => void;
};

export const LatticeRunLog = ({ lines, onClear }: Props): ReactElement => {
  const latest = lines.slice(-30);
  return (
    <section className="lattice-run-log">
      <header>
        <h3>Execution Log</h3>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </header>
      <ul>
        {latest.length === 0 ? (
          <li className="empty">No events yet</li>
        ) : (
          latest.map((line) => (
            <li key={line}>{line}</li>
          ))
        )}
      </ul>
    </section>
  );
};
