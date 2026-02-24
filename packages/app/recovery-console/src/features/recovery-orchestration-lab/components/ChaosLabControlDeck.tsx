import { memo } from 'react';

interface ChaosLabControlDeckProps {
  readonly isRunning: boolean;
  readonly directiveCount: number;
  readonly artifactCount: number;
  readonly title: string;
  readonly mode: string;
  readonly onRun: () => Promise<void>;
  readonly summary: string;
}

interface StatCell {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

const StatList = ({ rows }: { readonly rows: readonly StatCell[] }) => {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.key}>
          {row.label}: {row.value.toLocaleString()}
        </li>
      ))}
    </ul>
  );
};

export const ChaosLabControlDeck = memo(
  ({ isRunning, directiveCount, artifactCount, onRun, title, mode, summary }: ChaosLabControlDeckProps) => {
    const items: readonly StatCell[] = [
      { key: `${mode}-directives`, label: 'Directives', value: directiveCount },
      { key: `${mode}-artifacts`, label: 'Artifacts', value: artifactCount },
    ];
    return (
      <section>
        <h2>{title}</h2>
        <p>
          mode: <strong>{mode}</strong>
        </p>
        <p>
          status: <strong>{isRunning ? 'running' : 'idle'}</strong>
        </p>
        <p>summary: {summary}</p>
        <p>signal pressure: {directiveCount + artifactCount}</p>
        <StatList rows={items} />
        <button onClick={onRun} type="button" disabled={isRunning}>
          {isRunning ? 'Orchestrating…' : 'Run Chaos Orchestrations'}
        </button>
      </section>
    );
  },
);

ChaosLabControlDeck.displayName = 'ChaosLabControlDeck';
