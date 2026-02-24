import { type ReactElement, useMemo, useState } from 'react';
import type { ScenarioExecutionRow } from '@service/recovery-incident-lab-orchestrator';

interface DeckProps {
  readonly rows: readonly ScenarioExecutionRow[];
  readonly signatures: readonly string[];
  readonly onSeedAdd: () => void;
  readonly onReset: () => void;
  readonly onOutputSelect: (output: string) => void;
}

interface DeckRow {
  readonly label: string;
  readonly value: string;
}

const toDeckRows = (rows: readonly ScenarioExecutionRow[]): readonly DeckRow[] =>
  rows.map((row) => ({
    label: row.scenarioId,
    value: `${row.status}-${row.signalCount}-${row.telemetryCount}`,
  }));

const DeckSummary = ({
  signatures,
}: {
  readonly signatures: readonly string[];
}): ReactElement => {
  const top = signatures.slice(0, 5).join(' · ');
  return (
    <section className="advanced-deck-summary">
      <h3>Signatures</h3>
      <p>{top}</p>
    </section>
  );
};

export const RecoveryLabAdvancedDeck = ({ rows, signatures, onSeedAdd, onReset, onOutputSelect }: DeckProps): ReactElement => {
  const [collapsed, setCollapsed] = useState(false);
  const entries = useMemo(() => toDeckRows(rows), [rows]);
  const filtered = useMemo(
    () => (collapsed ? entries.slice(0, 2) : entries).toSorted((left, right) => right.value.localeCompare(left.value)),
    [collapsed, entries],
  );

  return (
    <section className="recovery-lab-advanced-deck">
      <header>
        <h2>Advanced deck</h2>
        <button onClick={onSeedAdd} type="button">
          seed+
        </button>
        <button onClick={() => setCollapsed((previous) => !previous)} type="button">
          {collapsed ? 'expand' : 'collapse'}
        </button>
        <button onClick={onReset} type="button">
          reset
        </button>
      </header>
      <DeckSummary signatures={signatures} />
      <ul>
        {filtered.map((entry) => (
          <li key={entry.label}>
            <button
              type="button"
              onClick={() => {
                onOutputSelect(entry.value);
              }}
            >
              {entry.label}: {entry.value}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
