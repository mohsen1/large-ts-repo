import { useMemo, type ReactElement } from 'react';
import type { PluginRunResult } from '@domain/recovery-ecosystem-analytics';
import { mapWithIteratorHelpers } from '@shared/type-level';

interface StudioRunJournalProps {
  readonly results: readonly PluginRunResult[];
  readonly running: boolean;
}

const normalizeTiming = (value: number): number => Math.max(0, Math.min(1_000, value));

const buildRows = (results: readonly PluginRunResult[]) =>
  mapWithIteratorHelpers(results, (entry, index) => ({
    key: `${entry.plugin}-${index}`,
    plugin: entry.plugin,
    accepted: entry.accepted,
    score: normalizeTiming(entry.signalCount),
    diagnostics: entry.diagnostics.length,
  }));

export const StudioRunJournal = ({
  results,
  running,
}: StudioRunJournalProps): ReactElement => {
  const rows = useMemo(() => buildRows(results), [results]);
  const total = useMemo(
    () => rows.reduce((acc, entry) => acc + entry.score, 0),
    [rows],
  );
  const top = useMemo(
    () => rows.toSorted((left, right) => right.score - left.score),
    [rows],
  );

  return (
    <section>
      <h4>Run Journal</h4>
      <p>running={String(running)}</p>
      <p>total-score={total}</p>
      <div>
        {top.map((entry) => (
          <article key={entry.key} style={{ marginBottom: 10 }}>
            <p>
              <strong>{entry.plugin}</strong>
              {' '}
              ·
              {' '}
              accepted=
              {String(entry.accepted)}
              {' '}
              ·
              {' '}
              score=
              {entry.score}
            </p>
            <p>
              diag=
              {entry.diagnostics}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};
